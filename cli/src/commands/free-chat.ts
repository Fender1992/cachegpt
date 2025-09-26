import chalk from 'chalk';
import ora from 'ora';
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
    output: process.stdout
  });

  console.log(chalk.cyan('💬 Start chatting! Type "exit" to quit.\n'));

  const chat = async () => {
    // Use the user's email (or "You" for anonymous) in the prompt
    const promptName = userEmail === 'You' ? 'You' : userEmail.split('@')[0];  // Use first part of email
    rl.question(chalk.green(`${promptName}: `), async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('\n👋 Goodbye!\n'));
        rl.close();
        return;
      }

      if (!input.trim()) {
        chat();
        return;
      }

      // Add user message
      messages.push({ role: 'user', content: input });

      const spinner = ora('Thinking...').start();

      try {
        const response = await callFreeProviderAPI(authToken.value, messages);
        spinner.stop();

        // Add assistant response
        messages.push({ role: 'assistant', content: response.response });

        // Show response with provider info
        console.log(chalk.blue('\\nAssistant: ') + response.response);

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

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red('\\n❌ Error: ') + error.message);

        // If it's an auth error, suggest re-authentication
        if (error.message.includes('401') || error.message.includes('authentication')) {
          console.log(chalk.yellow('\\n💡 Try: cachegpt logout && cachegpt login'));
        }
        console.log();
      }

      // Continue the chat loop after response or error
      chat();
    });
  };

  chat();
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
  const cached = data.metadata?.cacheHit || false;
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