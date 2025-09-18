import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logInfo } from '../lib/utils';
import readline from 'readline';

export async function chatCommand(): Promise<void> {
  const config: any = loadConfig();
  if (!config) {
    logError('Configuration not found. Please run "cachegpt init" first.');
    return;
  }


  // Check if using browser mode
  if (config.mode === 'browser') {
    const { chatBrowserCommand } = await import('./chat-browser');
    return await chatBrowserCommand();
  }

  // Check if using direct mode
  if (config.mode === 'direct') {
    const { chatDirectCommand } = await import('./chat-direct');
    return await chatDirectCommand();
  }

  // Proxy mode
  if (!config.baseUrl || !config.apiKey || !config.defaultModel) {
    logError('Configuration incomplete. Please run "cachegpt init" again.');
    return;
  }

  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║         CacheGPT Chat Interface 💬           ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray('Type your message and press Enter. Type "exit" or press Ctrl+C to quit.'));
  console.log(chalk.gray('Type "clear" to clear the screen, "help" for commands.'));
  console.log();

  // Create a complete config object with defaults
  const fullConfig = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModel: config.defaultModel,
    timeout: config.timeout || 30
  };

  const apiClient = createApiClient(fullConfig);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('You: ')
  });

  // Store conversation history
  const conversationHistory: Array<{ role: string; content: string }> = [];
  let isProcessing = false;

  // Display initial prompt
  rl.prompt();

  rl.on('line', async (input: string) => {
    const trimmedInput = input.trim();

    // Handle special commands
    if (trimmedInput.toLowerCase() === 'exit') {
      console.log(chalk.gray('\nGoodbye! 👋'));
      rl.close();
      return;
    }

    if (trimmedInput.toLowerCase() === 'clear') {
      console.clear();
      console.log(chalk.cyan('Chat cleared. Continue your conversation...'));
      console.log();
      rl.prompt();
      return;
    }

    if (trimmedInput.toLowerCase() === 'help') {
      console.log(chalk.yellow('\n📚 Available Commands:'));
      console.log(chalk.white('  exit    - Quit the chat'));
      console.log(chalk.white('  clear   - Clear the screen'));
      console.log(chalk.white('  history - Show conversation history'));
      console.log(chalk.white('  stats   - Show cache statistics'));
      console.log(chalk.white('  help    - Show this help message'));
      console.log();
      rl.prompt();
      return;
    }

    if (trimmedInput.toLowerCase() === 'history') {
      console.log(chalk.yellow('\n📜 Conversation History:'));
      conversationHistory.forEach((msg, index) => {
        const prefix = msg.role === 'user' ? chalk.green('You:') : chalk.blue('AI:');
        console.log(`${prefix} ${msg.content}`);
      });
      console.log();
      rl.prompt();
      return;
    }

    if (trimmedInput.toLowerCase() === 'stats') {
      await showCacheStats(apiClient);
      rl.prompt();
      return;
    }

    if (!trimmedInput) {
      rl.prompt();
      return;
    }

    // Prevent multiple simultaneous requests
    if (isProcessing) {
      console.log(chalk.yellow('⏳ Please wait for the current response...'));
      return;
    }

    isProcessing = true;

    // Add user message to history
    conversationHistory.push({ role: 'user', content: trimmedInput });

    // Show thinking indicator
    const thinkingInterval = showThinking();

    try {
      // Make API call through CacheGPT proxy
      const response = await apiClient.chat({
        model: fullConfig.defaultModel || 'gpt-3.5-turbo',
        messages: conversationHistory,
        temperature: 0.7,
        max_tokens: 1000
      });

      clearInterval(thinkingInterval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear thinking message

      // Display response
      if (response.cached) {
        console.log(chalk.gray(`[Cached response - ${response.similarity}% match]`));
      } else {
        console.log(chalk.gray('[Fresh response]'));
      }

      console.log(chalk.blue('AI: ') + response.content);
      console.log();

      // Add assistant message to history
      conversationHistory.push({ role: 'assistant', content: response.content });

      // Show cost savings if applicable
      if (response.cached && response.costSaved) {
        console.log(chalk.green(`💰 Saved: $${response.costSaved.toFixed(4)}`));
      }

    } catch (error: any) {
      clearInterval(thinkingInterval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');

      console.log(chalk.red('\n❌ Error: ') + (error.message || 'Failed to get response'));
      console.log(chalk.gray('Tip: Make sure your CacheGPT server is running and configured correctly.'));
      console.log();
    } finally {
      isProcessing = false;
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

function showThinking(): NodeJS.Timeout {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  return setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[i++ % frames.length])} Thinking...`);
  }, 80);
}

async function showCacheStats(apiClient: any): Promise<void> {
  try {
    const stats = await apiClient.getStats();
    console.log(chalk.yellow('\n📊 Cache Statistics:'));
    console.log(chalk.white(`  Total Requests: ${stats.totalRequests}`));
    console.log(chalk.white(`  Cache Hits: ${stats.cacheHits}`));
    console.log(chalk.white(`  Hit Rate: ${stats.hitRate}%`));
    console.log(chalk.white(`  Total Saved: $${stats.totalSaved}`));
    console.log();
  } catch (error) {
    console.log(chalk.red('Failed to fetch statistics'));
    console.log();
  }
}