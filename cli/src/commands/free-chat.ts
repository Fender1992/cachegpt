import chalk from 'chalk';
import { createInterface, Interface } from 'readline';
import { TokenManager } from '../lib/token-manager';
import { enrichMessageWithFiles, FileContext } from '../lib/file-context';
import * as readline from 'readline';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Compress long text for display (like Claude Code does)
 * Shows first N chars + "..." + last N chars
 */
function compressText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;

  const halfLength = Math.floor((maxLength - 5) / 2);
  return `${text.slice(0, halfLength)}... [${text.length} chars] ...${text.slice(-halfLength)}`;
}

/**
 * Format response with markdown-style rendering
 * Similar to Claude Code's output formatting
 */
function formatResponse(text: string): string {
  const lines = text.split('\n');
  let formatted = '';
  let inCodeBlock = false;
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        codeLanguage = line.slice(3).trim();
        formatted += chalk.dim('┌─ ' + (codeLanguage || 'code') + '\n');
      } else {
        formatted += chalk.dim('└─\n');
        codeLanguage = '';
      }
      continue;
    }

    if (inCodeBlock) {
      formatted += chalk.cyan('│ ') + chalk.gray(line) + '\n';
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      formatted += '\n' + chalk.bold.white(line.slice(4)) + '\n';
      continue;
    }
    if (line.startsWith('## ')) {
      formatted += '\n' + chalk.bold.cyan(line.slice(3)) + '\n';
      continue;
    }
    if (line.startsWith('# ')) {
      formatted += '\n' + chalk.bold.blue(line.slice(2)) + '\n';
      continue;
    }

    // Inline code
    let processedLine = line.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code));

    // Bold
    processedLine = processedLine.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));

    // Bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      processedLine = chalk.dim('•') + processedLine.slice(processedLine.indexOf('-') + 1);
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line.trim())) {
      processedLine = chalk.dim(line.match(/^\d+\./)?.[0] || '') + processedLine.slice(processedLine.indexOf('.') + 1);
    }

    formatted += processedLine + '\n';
  }

  return formatted;
}

export async function freeChatCommand(): Promise<void> {
  console.clear();

  // Minimal header like Claude Code
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.bold('  CacheGPT') + chalk.dim(' · Free AI Chat'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log();
  console.log(chalk.dim('  Working directory: ') + chalk.white(process.cwd()));
  console.log();

  const tokenManager = new TokenManager();

  // Check authentication
  let authToken = null;
  let userEmail = 'You';
  try {
    authToken = tokenManager.getCacheGPTAuth();
    userEmail = authToken.userEmail || 'You';
    console.log(chalk.dim('  Authenticated: ') + chalk.white(userEmail));
    console.log();
  } catch (error) {
    console.log(chalk.yellow('  Authentication required'));
    console.log();
    console.log('  Run: ' + chalk.cyan('cachegpt login'));
    console.log();
    return;
  }

  // Start chat with system context
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a helpful AI assistant in a terminal environment.

Current working directory: ${process.cwd()}
Operating system: ${process.platform}
User home directory: ${process.env.HOME || process.env.USERPROFILE || 'unknown'}

When the user asks about files or directories, you have access to their local filesystem context.
When asked about the current directory, refer to the working directory above.`
    }
  ];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Multi-line paste detection
  let pasteBuffer: string[] = [];
  let pasteTimeout: NodeJS.Timeout | null = null;
  let isProcessing = false;

  // Input history (readline has built-in support, we just track it)
  const commandHistory: string[] = [];

  // Handle graceful exit
  process.on('SIGINT', () => {
    console.log(chalk.dim('\n\n  Goodbye\n'));
    rl.close();
    process.exit(0);
  });

  // Prompt function
  const promptNext = () => {
    rl.resume();
    rl.setPrompt(chalk.bold.green('❯ '));
    rl.prompt();
  };

  // Process the complete input (single line or multi-line paste)
  const processInput = async (input: string) => {
    if (isProcessing) return;
    isProcessing = true;

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.dim('\n  Goodbye\n'));
      rl.close();
      process.exit(0);
    }

    if (!input.trim()) {
      isProcessing = false;
      promptNext();
      return;
    }

    // Check for file/directory references and add context
    const { enrichedMessage, fileContexts } = await enrichMessageWithFiles(input);

    // Show what files were read
    if (fileContexts.length > 0) {
      fileContexts.forEach(ctx => {
        if (ctx.type === 'directory') {
          console.log(chalk.dim(`  📁 Read directory: ${ctx.path} (${ctx.files?.length || 0} files)`));
        } else if (ctx.content) {
          const lines = ctx.content.split('\n').length;
          console.log(chalk.dim(`  📄 Read file: ${ctx.path} (${lines} lines)`));
        }
      });
    }

    // Show compressed version if input is very long
    if (enrichedMessage.length > 200) {
      console.log(chalk.dim('  [Input: ' + enrichedMessage.length + ' characters]'));
    }

    // Add message (use enriched message with file context)
    messages.push({ role: 'user', content: enrichedMessage });
    rl.pause();

    // Minimal thinking indicator
    console.log(chalk.dim('\n  ⋯\n'));

    // Call API
    callFreeProviderAPI(authToken.value, messages)
      .then(response => {
        // Clear thinking indicator
        process.stdout.write('\x1B[2A\x1B[2K\x1B[1A\x1B[2K');

        messages.push({ role: 'assistant', content: response.response });

        // Format and display response
        console.log(formatResponse(response.response));

        // Show metadata if cached
        if (response.cached) {
          console.log(chalk.dim('  ⚡ cached'));
        }
        console.log();

        isProcessing = false;
        setImmediate(() => {
          rl.resume();
          promptNext();
        });
      })
      .catch((error: any) => {
        // Clear thinking indicator
        process.stdout.write('\x1B[2A\x1B[2K\x1B[1A\x1B[2K');

        console.log(chalk.red('  Error: ') + chalk.dim(error.message));

        if (error.message.includes('401') || error.message.includes('authentication')) {
          console.log(chalk.dim('  Try: ') + chalk.cyan('cachegpt logout && cachegpt login'));
        }
        console.log();

        isProcessing = false;
        setImmediate(() => {
          rl.resume();
          promptNext();
        });
      });
  };

  // Handle input with paste detection
  rl.on('line', (input) => {
    // Add line to buffer
    pasteBuffer.push(input);

    // Clear any existing timeout
    if (pasteTimeout) {
      clearTimeout(pasteTimeout);
    }

    // Set a timeout to detect end of paste (50ms)
    // If more lines come in quickly, this timeout gets reset
    pasteTimeout = setTimeout(() => {
      // Combine all buffered lines
      const combinedInput = pasteBuffer.join('\n');
      pasteBuffer = [];

      // Add to command history for up/down arrow navigation
      if (combinedInput.trim() && !combinedInput.toLowerCase().match(/^(exit|quit)$/)) {
        commandHistory.push(combinedInput);
        // Add to readline's internal history (property exists but not in types)
        const rlWithHistory = rl as any;
        if (rlWithHistory.history && !rlWithHistory.history.includes(combinedInput)) {
          rlWithHistory.history.unshift(combinedInput);
        }
      }

      // Show paste indicator if multi-line
      const lineCount = combinedInput.split('\n').length;
      if (lineCount > 1) {
        console.log(chalk.dim(`  [Pasted: ${lineCount} lines]`));
      }

      // Process the combined input
      processInput(combinedInput);
    }, 50);
  });

  // Keep process alive
  const keepAlive = setInterval(() => {}, 100000);

  rl.on('close', () => {
    console.log(chalk.dim('\n  Goodbye\n'));
    clearInterval(keepAlive);
    process.exit(0);
  });

  // Start
  promptNext();
  process.stdin.resume();
}

async function callFreeProviderAPI(bearerToken: string, messages: ChatMessage[]): Promise<{
  response: string;
  provider: string;
  cached: boolean;
  timeSaved?: number;
  costSaved?: number;
}> {
  const apiUrl = process.env.CACHEGPT_API_URL || 'https://cachegpt.app';

  const response = await fetch(`${apiUrl}/api/v2/unified-chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'cachegpt-cli/1.0.0'
    },
    body: JSON.stringify({
      provider: 'auto',
      messages,
      authMethod: 'oauth',
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    response: data.response,
    provider: data.metadata?.provider || 'free-provider',
    cached: data.metadata?.cached || data.metadata?.cacheHit || false,
    timeSaved: data.metadata?.timeSavedMs || 0,
    costSaved: data.metadata?.costSaved || 0
  };
}
