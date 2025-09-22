import chalk from 'chalk';
import readline from 'readline';
import inquirer from 'inquirer';
import { CacheService } from '../lib/cache-service';
import { logError } from '../lib/utils';

interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  id: string;
  model: string;
  role: string;
  stop_reason: string;
  stop_sequence: string | null;
  type: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Chat using Anthropic API directly (like Claude Code does)
 * This uses API calls, not web automation, so chats won't appear in Claude console
 */
export async function chatApiCommand(): Promise<void> {
  // Get API key from environment or config
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    logError('Anthropic API key not found. Please set ANTHROPIC_API_KEY environment variable.');
    console.log(chalk.yellow('\nTo get an API key:'));
    console.log('1. Visit https://console.anthropic.com/');
    console.log('2. Sign in with your Claude account');
    console.log('3. Go to API Keys section');
    console.log('4. Create a new key');
    console.log('5. Set it: export ANTHROPIC_API_KEY="your-key"');
    return;
  }

  console.clear();
  console.log();
  console.log(chalk.bold.cyan('  Claude API Chat (Private Mode)'));
  console.log(chalk.dim('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();

  // Check authentication and get user info
  const cacheService = new CacheService();
  const userInfo = await cacheService.getUserInfo();

  if (userInfo && userInfo.name) {
    console.log(chalk.green(`  👋 Welcome back, ${userInfo.name}!`));
    console.log(chalk.gray(`  Authenticated via ${userInfo.provider}`));
    console.log();
  } else {
    // User is not logged in, offer login option
    console.log(chalk.yellow('  🔐 You are not logged in.'));
    console.log(chalk.gray('  Login to sync your chats across devices and access cloud features.'));
    console.log();

    const loginChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          {
            name: '🔑 Login to your account',
            value: 'login'
          },
          {
            name: '💬 Continue without login (local only)',
            value: 'continue'
          }
        ]
      }
    ]);

    if (loginChoice.action === 'login') {
      const { loginCommand } = await import('./login');
      console.log();
      console.log(chalk.cyan('Opening browser for login...'));
      await loginCommand();

      // After login, restart the chat command to show welcome message
      console.log(chalk.green('\n✅ Login completed! Starting chat...'));
      console.log();
      return await chatApiCommand();
    }

    console.log(chalk.gray('  Continuing with local chat only...'));
    console.log();
  }

  console.log(chalk.dim('  This chat uses the Claude API directly.'));
  console.log(chalk.dim('  Conversations will NOT appear in Claude web console.'));
  console.log();
  console.log(chalk.dim('  Commands: ') + chalk.white('exit') + chalk.dim(' | ') + chalk.white('clear') + chalk.dim(' | ') + chalk.white('help'));
  console.log();

  const conversationHistory: Array<{ role: string; content: string }> = [];

  // Set prompt based on user info
  const promptText = userInfo && userInfo.name
    ? chalk.bold.cyan(`\n▸ ${userInfo.name}: `)
    : chalk.bold.cyan('\n▸ You: ');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptText
  });

  let isProcessing = false;

  rl.prompt();

  rl.on('line', async (input: string) => {
    const trimmedInput = input.trim();

    // Handle special commands
    if (trimmedInput.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    if (trimmedInput.toLowerCase() === 'clear') {
      console.clear();
      console.log();
      console.log(chalk.bold.cyan('  Claude API Chat (Private Mode)'));
      console.log(chalk.dim('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log();
      rl.prompt();
      return;
    }

    if (trimmedInput.toLowerCase() === 'help') {
      console.log();
      console.log(chalk.bold.yellow('  Available Commands'));
      console.log(chalk.dim('  ─────────────────'));
      console.log('  ' + chalk.bold('exit') + chalk.dim('    - Quit the chat'));
      console.log('  ' + chalk.bold('clear') + chalk.dim('   - Clear the screen'));
      console.log('  ' + chalk.bold('help') + chalk.dim('    - Show this help message'));
      console.log();
      rl.prompt();
      return;
    }

    if (!trimmedInput) {
      rl.prompt();
      return;
    }

    if (isProcessing) {
      console.log(chalk.yellow('  ⏳ Please wait for the current response...'));
      return;
    }

    isProcessing = true;

    // Add user message to history
    conversationHistory.push({ role: 'user', content: trimmedInput });

    // Display user message
    console.log(chalk.dim('\n  You:'));
    console.log(chalk.bold.white('  ' + trimmedInput));

    // Show thinking indicator
    process.stdout.write(`\n  ${chalk.cyan('◉')} ${chalk.dim('Thinking...')}`);

    try {
      // Call Anthropic API directly
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229', // or claude-3-sonnet-20240229 for faster/cheaper
          max_tokens: 1024,
          messages: conversationHistory,
          temperature: 0.7
        })
      });

      process.stdout.write('\r' + ' '.repeat(60) + '\r'); // Clear thinking message

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error: ${response.status} - ${error}`);
      }

      const data = await response.json() as AnthropicResponse;

      // Extract text from response
      const responseText = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      // Display response
      console.log();
      console.log(chalk.bold.cyan('  ✨ Claude API Response'));
      console.log();
      console.log(chalk.dim('  Assistant:'));
      const formattedResponse = responseText
        .split('\n')
        .map((line: string) => '  ' + line)
        .join('\n');
      console.log(chalk.bold.white(formattedResponse));
      console.log();

      // Add to conversation history
      conversationHistory.push({ role: 'assistant', content: responseText });

      // Save to cache (local only, not to Claude)
      await cacheService.saveChat(trimmedInput, responseText, {
        model: 'claude-3-opus',
        provider: 'anthropic-api',
        tokens_used: data.usage.input_tokens + data.usage.output_tokens,
        cache_hit: false
      });

      // Show token usage
      console.log(chalk.dim(`  📊 Tokens: ${data.usage.input_tokens} in, ${data.usage.output_tokens} out`));
      console.log();

    } catch (error: any) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      console.log();
      console.log(chalk.red('  ⚠ Error: ') + chalk.white(error.message || 'Failed to get response'));

      if (error.message.includes('401')) {
        console.log(chalk.dim('  Invalid API key. Please check your ANTHROPIC_API_KEY.'));
      } else if (error.message.includes('429')) {
        console.log(chalk.dim('  Rate limited. Please wait a moment and try again.'));
      }
      console.log();
    } finally {
      isProcessing = false;
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.dim('\n  Goodbye! 👋\n'));
    process.exit(0);
  });
}