import chalk from 'chalk';
import { createInterface, Interface } from 'readline';
import { TokenManager } from '../lib/token-manager';
import { enrichMessageWithFiles, FileContext } from '../lib/file-context';
import {
  parseFileOperations,
  writeFile,
  editFile,
  deleteFile,
  formatOperationResult,
  showDiff,
  FileOperation
} from '../lib/file-operations';
import {
  parseShellOperations,
  executeCommand,
  formatShellResult,
  isDangerousCommand,
  isSafeCommand,
  getSafetyWarning,
  ShellOperation
} from '../lib/shell-operations';
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
      content: `You are a helpful AI assistant in a terminal environment with file operation capabilities.

Current working directory: ${process.cwd()}
Operating system: ${process.platform}
User home directory: ${process.env.HOME || process.env.USERPROFILE || 'unknown'}

## File Operations

You can read, write, edit, and delete files. When the user mentions files, they are automatically read and added to context.

### Writing/Creating Files
To create or overwrite a file, use this syntax:
WRITE_FILE: path/to/file.txt
\`\`\`language
file content here
\`\`\`

Example:
WRITE_FILE: src/hello.js
\`\`\`javascript
console.log('Hello, World!');
\`\`\`

### Editing Files
To edit an existing file (find and replace), use:
EDIT_FILE: path/to/file.txt REPLACE "old text" WITH "new text"

Example:
EDIT_FILE: config.json REPLACE "debug": false WITH "debug": true

### Deleting Files
To delete a file, use:
DELETE_FILE: path/to/file.txt

Example:
DELETE_FILE: old-script.js

## Shell Commands

You can execute shell/terminal commands. Use this syntax:
EXECUTE: command here

Or use bash code blocks:
\`\`\`bash
command here
\`\`\`

Examples:
EXECUTE: curl https://api.github.com/users/octocat
EXECUTE: docker ps -a
EXECUTE: systemctl status nginx
EXECUTE: kubectl get pods

Supported systems and tools:
- Linux utilities: ls, cat, grep, find, sed, awk, ps, top, df, du, etc.
- Docker: docker ps, docker logs, docker exec, docker-compose, etc.
- Kubernetes: kubectl, helm, minikube, etc.
- System services: systemctl, service, journalctl, etc.
- Package managers: apt, yum, brew, npm, pip, cargo, etc.
- Development: git, make, gcc, node, python, go, rust, etc.
- Cloud CLIs: aws, az, gcloud, doctl, heroku, etc.
- Networking: curl, wget, ping, netstat, ss, dig, etc.
- Databases: mysql -e, psql -c, redis-cli, etc.

Dangerous commands (rm -rf /, mkfs, dd if=/dev/zero) are blocked for safety.
System power commands (shutdown, reboot) show warnings but can execute.

## Guidelines
- Always explain what you're about to do before performing file or shell operations
- For edits, show the user what will change
- For shell commands, explain what the command does
- Use relative paths when possible
- Ask for confirmation on destructive operations (delete, overwrite large files)
- When asked to create/modify code files, use the appropriate language syntax in code blocks
- Shell commands timeout after 30 seconds
- Output longer than 20 lines will be truncated`
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
    rl.setPrompt(chalk.bold.green('› '));
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
        if (ctx.error) {
          console.log(chalk.dim(`  ❌ ${ctx.path}: ${ctx.error}`));
        } else if (ctx.type === 'directory') {
          console.log(chalk.dim(`  📁 Read directory: ${ctx.path} (${ctx.files?.length || 0} files)`));
        } else if (ctx.content) {
          const lines = ctx.content.split('\n').length;
          const chars = ctx.content.length;
          console.log(chalk.dim(`  📄 Read file: ${ctx.path} (${lines} lines, ${chars} chars)`));
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
      .then(async response => {
        // Clear thinking indicator
        process.stdout.write('\x1B[2A\x1B[2K\x1B[1A\x1B[2K');

        // Parse AI response for file and shell operations
        const { cleanResponse: cleanResponseAfterFiles, operations: fileOps } = parseFileOperations(response.response);
        const { cleanResponse: finalCleanResponse, operations: shellOps } = parseShellOperations(cleanResponseAfterFiles);

        messages.push({ role: 'assistant', content: response.response });

        // Format and display response
        console.log(formatResponse(finalCleanResponse));

        // Execute file operations if any
        if (fileOps.length > 0) {
          console.log(chalk.dim('\n  File Operations:\n'));

          for (const op of fileOps) {
            let result: FileOperation;

            if (op.type === 'write') {
              result = await writeFile(op.path, op.content || '');
              console.log('  ' + formatOperationResult(result));

              if (result.success && result.content) {
                const lines = result.content.split('\n').length;
                console.log(chalk.dim(`    ${lines} lines written`));
              }
            } else if (op.type === 'edit') {
              result = await editFile(op.path, 'replace', op.searchText, op.replaceText);
              console.log('  ' + formatOperationResult(result));

              if (result.success && result.oldContent && result.newContent) {
                console.log(showDiff(result.oldContent, result.newContent, 5));
              }
            } else if (op.type === 'delete') {
              result = await deleteFile(op.path);
              console.log('  ' + formatOperationResult(result));
            }
          }

          console.log();
        }

        // Execute shell commands if any
        if (shellOps.length > 0) {
          console.log(chalk.dim('\n  Shell Commands:\n'));

          for (const op of shellOps) {
            // Safety check
            const warning = getSafetyWarning(op.command);
            if (warning) {
              console.log(chalk.yellow(`  ${warning}\n`));
              if (isDangerousCommand(op.command)) {
                // Skip dangerous commands
                continue;
              }
            }

            // Execute command
            const result = await executeCommand(op.command);
            console.log(formatShellResult(result));
          }

          console.log();
        }

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
