import chalk from 'chalk';
import { createInterface } from 'readline';
import { TokenManager } from '../lib/token-manager';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function freeChatCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║            Free CacheGPT Chat 🆓             ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.green('🎉 Powered by free LLM providers with smart caching'));
  console.log(chalk.gray('   No API keys needed - just login and chat!'));
  console.log();

  const tokenManager = new TokenManager();

  // Check if user is authenticated
  let authToken = null;
  let userEmail = 'You';  // Default to "You" for anonymous users
  try {
    authToken = tokenManager.getCacheGPTAuth();
    userEmail = authToken.userEmail || 'You';  // Use email if available, otherwise "You"
    console.log(chalk.green('✅ Authenticated as:'), userEmail);
  } catch (error) {
    console.log(chalk.yellow('🔐 Not authenticated. Let\'s fix that!\n'));

    console.log('Run this command to authenticate:');
    console.log(chalk.cyan('  cachegpt login'));
    console.log();
    console.log('This will open your browser to login with Google/GitHub.');
    console.log('Then come back and run this command again.');
    return;
  }

  console.log(chalk.gray('🤖 Using: Groq (Llama 3.1 70B) → OpenRouter → HuggingFace'));
  console.log(chalk.gray('📦 Smart caching: Repeated questions return instantly'));
  console.log();

  // Start chat
  const messages: ChatMessage[] = [];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true  // Explicitly set for Windows
  });

  console.log(chalk.cyan('💬 Start chatting! Type "exit" to quit.\n'));

  // Handle process termination gracefully
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n👋 Goodbye!\n'));
    rl.close();
    process.exit(0);
  });

  // Function to prompt for next input
  const promptNext = () => {
    const promptName = userEmail === 'You' ? 'You' : userEmail.split('@')[0];
    // Ensure readline is resumed and active
    rl.resume();
    rl.setPrompt(chalk.green(`${promptName}: `));
    rl.prompt();
  };

  // Handle line input - NOT async to avoid Windows issues
  rl.on('line', (input) => {
    // Debug logging
    if (process.env.DEBUG === 'true') {
      console.log(chalk.gray(`[DEBUG] Received input: "${input}"`));
    }

    if (input.toLowerCase() === 'exit') {
      console.log(chalk.yellow('\n👋 Goodbye!\n'));
      rl.close();
      process.exit(0);
    }

    if (!input.trim()) {
      // Empty input - just show the prompt again
      promptNext();
      return;
    }

    // Add user message
    messages.push({ role: 'user', content: input });

    // Pause readline while processing
    rl.pause();

    // Show thinking message without spinner (spinner can break readline on Windows)
    console.log(chalk.gray('\n🤔 Thinking...'));

    // Process the API call in a Promise
    callFreeProviderAPI(authToken.value, messages)
      .then(response => {
        // Try to clear the thinking message (may not work on all terminals)
        try {
          process.stdout.write('\x1B[1A\x1B[2K'); // Move up one line and clear it
        } catch (e) {
          // If ANSI codes fail, just continue
        }

        // Add assistant response
        messages.push({ role: 'assistant', content: response.response });

        // Show response with provider info
        console.log(chalk.blue('Assistant: ') + response.response);

        if (response.cached) {
          let cacheInfo = '   ⚡ From cache';
          if (response.timeSaved && response.costSaved) {
            cacheInfo += chalk.green(` (saved ${response.timeSaved}ms, $${response.costSaved.toFixed(4)})`);
          }
          console.log(chalk.gray(cacheInfo));
        } else {
          console.log(chalk.gray(`   🤖 From ${response.provider}`));
          console.log(chalk.gray(`   📝 Response cached for future use`));
        }
        console.log();

        // Debug: Ensure readline is still active
        if (process.env.DEBUG === 'true') {
          console.log(chalk.gray('[DEBUG] Prompting for next input...'));
        }

        // IMPORTANT: Use setImmediate to ensure proper event loop handling on Windows
        setImmediate(() => {
          try {
            rl.resume();
            promptNext();
          } catch (e) {
            console.log(chalk.red('[ERROR] Readline interface error:'), e);
          }
        });
      })
      .catch((error: any) => {
        // Try to clear the thinking message
        try {
          process.stdout.write('\x1B[1A\x1B[2K');
        } catch (e) {
          // If ANSI codes fail, just continue
        }

        console.log(chalk.red('❌ Error: ') + error.message);

        // If it's an auth error, suggest re-authentication
        if (error.message.includes('401') || error.message.includes('authentication')) {
          console.log(chalk.yellow('\n💡 Try: cachegpt logout && cachegpt login'));
        }
        console.log();

        // Debug logging
        if (process.env.DEBUG === 'true') {
          console.log(chalk.gray('[DEBUG] Error occurred, prompting for next input...'));
        }

        // Still prompt for next input on error
        setImmediate(() => {
          try {
            rl.resume();
            promptNext();
          } catch (e) {
            console.log(chalk.red('[ERROR] Readline interface error on retry:'), e);
          }
        });
      });
  });

  // Keep the process alive - use setInterval for Windows compatibility
  const keepAlive = setInterval(() => {
    // This keeps the event loop active
  }, 100000);

  // Handle close event
  rl.on('close', () => {
    console.log(chalk.yellow('\n👋 Goodbye!\n'));
    clearInterval(keepAlive);
    process.exit(0);
  });

  // Start the first prompt
  promptNext();

  // Ensure stdin stays open on Windows
  // Don't use setRawMode in chat applications as it breaks normal input
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
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: 'auto', // Let server pick the best free provider
      messages,
      authMethod: 'oauth', // Using OAuth, not API keys
      // No credential needed - server will use free providers
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  const data = await response.json();

  // Extract provider info from response metadata if available
  const provider = data.metadata?.provider || 'free-provider';
  const cached = data.metadata?.cached || data.metadata?.cacheHit || false; // Check both field names
  const timeSaved = data.metadata?.timeSavedMs || 0;
  const costSaved = data.metadata?.costSaved || 0;

  // Log cache debugging info
  if (process.env.DEBUG_CACHE === 'true') {
    console.log(chalk.gray(`\\n[DEBUG] Cache hit: ${cached}, Time saved: ${timeSaved}ms, Cost saved: $${costSaved}`));
  }

  return {
    response: data.response,
    provider,
    cached,
    timeSaved,
    costSaved
  };
}