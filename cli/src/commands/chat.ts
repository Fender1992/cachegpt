import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logInfo } from '../lib/utils';
import { CacheService } from '../lib/cache-service';
import { AuthService } from '../lib/auth-service';
import readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function chatCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║         CacheGPT Chat Interface 💬           ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
  console.log();

  // ALWAYS check OAuth authentication first, regardless of API key configuration
  const cacheService = new CacheService();
  const userInfo = await cacheService.getUserInfo();

  if (userInfo && userInfo.name) {
    console.log(chalk.green(`👋 Welcome back, ${userInfo.name}!`));
    console.log(chalk.gray(`Authenticated via ${userInfo.provider}`));
    console.log();
  } else {
    // User is not logged in, offer login option
    console.log(chalk.yellow('🔐 You are not logged in to CacheGPT.'));
    console.log(chalk.gray('Login to sync your chats across devices and access cloud features.'));
    console.log();

    const loginChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          {
            name: '🔑 Login with Google/GitHub to your CacheGPT account',
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
      await loginCommand();

      // After login and LLM setup, restart the chat command
      console.log(chalk.green('\n✅ Setup complete! Starting chat...'));
      console.log();
      return await chatCommand();
    }

    console.log(chalk.gray('Continuing without CacheGPT account (local only)...'));
    console.log();
  }

  // Now check for API key configuration AFTER OAuth check
  let config: any = loadConfig();

  // If no local config, try to load provider credentials from database
  if (!config && userInfo) {
    console.log(chalk.gray('🔍 Loading your saved LLM provider credentials...'));
    config = await loadProviderCredentials();
  }

  if (!config) {
    console.log(chalk.yellow('⚠️  No API configuration found.'));
    console.log(chalk.gray('You need to configure your LLM API keys to start chatting.'));
    console.log();

    const setupChoice = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setup',
        message: 'Would you like to set up your API keys now?',
        default: true
      }
    ]);

    if (setupChoice.setup) {
      const { initCommand } = await import('./init');
      await initCommand();
      // Restart chat after setup
      return await chatCommand();
    } else {
      logError('Please run "cachegpt init" to configure your API keys.');
      return;
    }
  }

  // Check if using browser mode
  if (config.mode === 'browser') {
    console.log(chalk.yellow('Browser chat mode is temporarily unavailable.'));
    console.log(chalk.gray('Please use API key mode instead.'));
    return;
  }

  // Check if using direct mode
  if (config.mode === 'direct') {
    const { chatDirectCommand } = await import('./chat-direct');
    return await chatDirectCommand();
  }

  // Proxy mode
  if (!config.baseUrl || !config.apiKey || !config.defaultModel) {
    logError('API configuration incomplete. Please run "cachegpt init" again.');
    return;
  }

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

  // Set prompt based on user info (userInfo is already defined at the top)
  const promptText = userInfo && userInfo.name
    ? chalk.green(`${userInfo.name}: `)
    : chalk.green('You: ');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptText
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
        const userPrefix = userInfo && userInfo.name
          ? chalk.green(`${userInfo.name}:`)
          : chalk.green('You:');
        const prefix = msg.role === 'user' ? userPrefix : chalk.blue('AI:');
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

      // Save chat to cache (both locally and in cloud if authenticated)
      await cacheService.saveChat(trimmedInput, response.content, {
        model: fullConfig.defaultModel || 'gpt-3.5-turbo',
        provider: 'openai',
        cache_hit: response.cached || false
      });

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
    // Get cache stats from both API and local cache service
    const cacheService = new CacheService();
    const localStats = await cacheService.getCacheStats();

    console.log(chalk.yellow('\n📊 Cache Statistics:'));
    console.log(chalk.white(`  Total Entries: ${localStats.total_entries}`));
    console.log(chalk.white(`  Local Cache: ${localStats.local_entries} entries`));
    console.log(chalk.white(`  Cloud Cache: ${localStats.cloud_entries} entries`));
    console.log(chalk.white(`  Authenticated: ${localStats.authenticated ? 'Yes' : 'No'}`));

    if (localStats.user_id) {
      console.log(chalk.white(`  User ID: ${localStats.user_id.substring(0, 8)}...`));
    }

    // Try to get API stats as well
    try {
      const stats = await apiClient.getStats();
      console.log(chalk.white(`  API Hit Rate: ${stats.hitRate}%`));
      console.log(chalk.white(`  Total Saved: $${stats.totalSaved}`));
    } catch (e) {
      // API stats not available
    }

    console.log();
  } catch (error) {
    console.log(chalk.red('Failed to fetch statistics'));
    console.log();
  }
}

async function loadProviderCredentials(): Promise<any> {
  try {
    const authService = new AuthService();
    const currentUser = await authService.getCurrentUser();

    if (!currentUser) {
      return null;
    }

    // Load environment variables from .env.defaults if needed
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const dotenv = await import('dotenv');
      const defaultsPath = path.join(__dirname, '../../.env.defaults');
      if (fs.existsSync(defaultsPath)) {
        dotenv.config({ path: defaultsPath });
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Fallback to local file
      return loadProviderCredentialsLocally();
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get provider credentials from database
    const { data, error } = await supabase
      .from('user_provider_credentials')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // Fallback to local file
      return loadProviderCredentialsLocally();
    }

    // Convert database credentials to config format
    const config = {
      provider: data.provider,
      mode: data.llm_token ? 'browser' : 'api',
      authMethod: data.llm_token ? 'web-session' : 'api-key',
      apiKey: data.api_key ? decrypt(data.api_key) : undefined,
      sessionKey: data.llm_token ? decrypt(data.llm_token) : undefined,
      userEmail: data.user_email
    };

    console.log(chalk.green(`✅ Loaded ${data.provider} credentials from database`));
    return config;

  } catch (error: any) {
    console.log(chalk.yellow(`⚠️ Database error: ${error.message} - trying local file`));
    return loadProviderCredentialsLocally();
  }
}

function loadProviderCredentialsLocally(): any {
  try {
    const configPath = path.join(os.homedir(), '.cachegpt', 'provider-config.json');

    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const encryptedConfig = JSON.parse(content);

    // Convert local credentials to config format
    const config = {
      provider: encryptedConfig.provider,
      mode: encryptedConfig.llmToken ? 'browser' : 'api',
      authMethod: encryptedConfig.llmToken ? 'web-session' : 'api-key',
      apiKey: encryptedConfig.apiKey ? decrypt(encryptedConfig.apiKey) : undefined,
      sessionKey: encryptedConfig.llmToken ? decrypt(encryptedConfig.llmToken) : undefined,
      userEmail: encryptedConfig.userEmail
    };

    console.log(chalk.green(`✅ Loaded ${encryptedConfig.provider} credentials from local file`));
    return config;

  } catch (error: any) {
    console.log(chalk.gray('No local provider credentials found'));
    return null;
  }
}

function decrypt(text: string): string {
  // Simple base64 decoding - matches the encryption in auth-provider.ts
  return Buffer.from(text, 'base64').toString('utf8');
}