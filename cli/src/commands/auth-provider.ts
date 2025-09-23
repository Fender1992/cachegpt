#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import open from 'open';
import { BrowserAuth } from '../lib/browser-auth';
import { saveConfig, getConfigPath } from '../lib/config';
import { AuthService } from '../lib/auth-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ProviderAuthConfig {
  provider: string;
  userEmail: string;
  sessionToken: string;
  llmToken?: string;
  apiKey?: string;
}

export async function authProviderCommand(provider: string, userEmail: string, sessionToken: string) {
  console.log(chalk.cyan(`\n🤖 Setting up ${provider.toUpperCase()} authentication...\n`));
  console.log(chalk.gray(`Logged in as: ${userEmail}`));
  console.log();

  const spinner = ora('Preparing authentication...').start();

  try {
    let authConfig: ProviderAuthConfig = {
      provider,
      userEmail,
      sessionToken
    };

    switch (provider.toLowerCase()) {
      case 'chatgpt':
        spinner.text = 'Opening ChatGPT authentication...';
        authConfig = await authenticateChatGPT(authConfig, spinner);
        break;

      case 'claude':
        spinner.text = 'Opening Claude authentication...';
        authConfig = await authenticateClaude(authConfig, spinner);
        break;

      case 'gemini':
        spinner.text = 'Setting up Gemini...';
        authConfig = await authenticateGemini(authConfig);
        break;

      case 'perplexity':
        spinner.text = 'Setting up Perplexity...';
        authConfig = await authenticatePerplexity(authConfig);
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    spinner.succeed(`${provider.toUpperCase()} authentication complete!`);

    // Save the configuration
    await saveProviderConfig(authConfig);

    console.log();
    console.log(chalk.green('✅ All set! You can now start chatting with your LLM.'));
    console.log();
    console.log(chalk.cyan('Next steps:'));
    console.log('  • Use', chalk.yellow('cachegpt chat'), 'to start a conversation');
    console.log('  • Use', chalk.yellow('cachegpt stats'), 'to view usage statistics');
    console.log('  • Use', chalk.yellow('cachegpt logout'), 'to sign out');

  } catch (error: any) {
    spinner.fail('Authentication failed');
    console.error(chalk.red('\n❌ Error:'), error.message || error);
    process.exit(1);
  }
}

async function authenticateChatGPT(config: ProviderAuthConfig, spinner: any): Promise<ProviderAuthConfig> {
  spinner.stop(); // Stop spinner immediately when entering this function

  console.log();
  console.log(chalk.yellow('ChatGPT Authentication Options:'));
  console.log('1. Use browser session (recommended)');
  console.log('2. Use API key');
  console.log();

  const { authMethod } = await inquirer.prompt({
    type: 'list',
    name: 'authMethod',
    message: 'How would you like to authenticate?',
    choices: [
      { name: '🌐 Browser Session (Free, no API key needed)', value: 'browser' },
      { name: '🔑 API Key (Requires OpenAI account with credits)', value: 'apikey' }
    ]
  });

  if (authMethod === 'browser') {
    console.log();
    console.log(chalk.cyan('📋 Manual ChatGPT Session Setup:'));
    console.log();
    console.log(chalk.white('Step 1: Open ChatGPT in your browser'));
    console.log(chalk.gray('  • Go to: https://chat.openai.com'));
    console.log(chalk.gray('  • Log in to your account'));
    console.log();
    console.log(chalk.white('Step 2: Get your session token'));
    console.log(chalk.gray('  • Press F12 to open Developer Tools'));
    console.log(chalk.gray('  • Go to Application → Cookies → https://chat.openai.com'));
    console.log(chalk.gray('  • Find the "__Secure-next-auth.session-token" cookie'));
    console.log(chalk.gray('  • Copy its value (long string of characters)'));
    console.log();

    // Open ChatGPT automatically to help user
    const open = await import('open').catch(() => null);
    if (open) {
      try {
        await open.default('https://chat.openai.com');
        console.log(chalk.green('✅ Opened ChatGPT in your browser'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Could not open browser automatically'));
      }
    }

    console.log();

    const { sessionToken } = await inquirer.prompt({
      type: 'password',
      name: 'sessionToken',
      message: 'Paste your ChatGPT session token:',
      mask: '*',
      validate: (input) => {
        if (!input || input.length < 20) {
          return 'Session token is required and should be a long string (20+ characters)';
        }
        return true;
      }
    });

    config.llmToken = sessionToken;
    console.log(chalk.green('✓ ChatGPT session token saved!'));
  } else {
    console.log();
    console.log(chalk.cyan('You\'ll need an OpenAI API key.'));
    console.log(chalk.gray('Get one at: https://platform.openai.com/api-keys'));
    console.log();

    const { apiKey } = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenAI API key:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'API key is required';
        if (!input.startsWith('sk-')) return 'Invalid API key format';
        return true;
      }
    });

    config.apiKey = apiKey;
    console.log(chalk.green('✓ API key saved!'));
  }

  return config;
}

async function authenticateClaude(config: ProviderAuthConfig, spinner: any): Promise<ProviderAuthConfig> {
  spinner.stop(); // Stop spinner immediately when entering this function

  console.log();
  console.log(chalk.yellow('Claude Authentication Options:'));
  console.log('1. Use browser session (recommended)');
  console.log('2. Use API key');
  console.log();

  const { authMethod } = await inquirer.prompt({
    type: 'list',
    name: 'authMethod',
    message: 'How would you like to authenticate?',
    choices: [
      { name: '🌐 Browser Session (Free, no API key needed)', value: 'browser' },
      { name: '🔑 API Key (Requires Anthropic account with credits)', value: 'apikey' }
    ]
  });

  if (authMethod === 'browser') {
    spinner.stop(); // Stop the spinner before showing the authentication flow

    console.log();
    console.log(chalk.cyan('🌐 Claude Web Authentication'));
    console.log(chalk.white('This works just like Claude Code!'));
    console.log(chalk.gray('1. Your browser will open to claude.ai'));
    console.log(chalk.gray('2. Log in with your existing account (Google, email, etc.)'));
    console.log(chalk.gray('3. Once logged in, we\'ll capture your session\n'));

    // Step 1: Open Claude.ai in the browser
    console.log(chalk.yellow('Opening claude.ai in your browser...'));

    const open = await import('open').catch(() => null);
    if (open) {
      try {
        await open.default('https://claude.ai/new');
        console.log(chalk.green('✅ Opened Claude in your browser'));
      } catch (error) {
        console.log(chalk.yellow('⚠️ Could not open browser automatically'));
        console.log(chalk.gray('Please manually go to: https://claude.ai/new'));
      }
    }

    console.log();
    console.log(chalk.cyan('Please log in to Claude using your preferred method.'));
    console.log(chalk.gray('(Google, email, or any way you normally sign in)\n'));

    // Step 2: Wait for user to confirm they're logged in
    const { isLoggedIn } = await inquirer.prompt({
      type: 'confirm',
      name: 'isLoggedIn',
      message: 'Have you successfully logged in to Claude?',
      default: false
    });

    if (!isLoggedIn) {
      console.log(chalk.yellow('\nPlease try again when you\'re ready to log in.'));
      return config;
    }

    // Step 3: Guide user to get session cookie
    console.log(chalk.cyan('\n📋 Now we need to capture your session (just like Claude Code does):\n'));
    console.log(chalk.white('Instructions:'));
    console.log('1. In the Claude tab, press F12 to open Developer Tools');
    console.log('2. Go to the "Application" tab (or "Storage" in Firefox)');
    console.log('3. On the left, expand "Cookies" and click on "https://claude.ai"');
    console.log('4. Look for a cookie named "sessionKey" or similar');
    console.log('5. Copy the cookie value (it\'s a long string)');
    console.log(chalk.gray('\nNote: This is exactly what Claude Code does behind the scenes!\n'));

    // Step 4: Let user paste the session cookie
    const { sessionCookie } = await inquirer.prompt({
      type: 'password',
      name: 'sessionCookie',
      message: 'Paste your session cookie value here:',
      mask: '*',
      validate: (input) => {
        if (!input || input.length < 20) {
          return 'Session cookie is required and should be a long string';
        }
        return true;
      }
    });

    // Step 5: Test the session by making a request
    console.log(chalk.yellow('\n🔍 Testing your session...'));

    const testSuccess = await testClaudeSession(sessionCookie);

    if (!testSuccess) {
      console.log(chalk.red('\n❌ Session test failed. The cookie might be expired or invalid.'));
      console.log(chalk.yellow('Please make sure you:'));
      console.log('1. Are logged in to claude.ai');
      console.log('2. Copied the correct cookie value');
      console.log('3. The session is still active\n');

      const { sessionToken } = await inquirer.prompt({
        type: 'password',
        name: 'sessionToken',
        message: 'Try pasting the cookie again (or press Enter to skip test):',
        mask: '*'
      });

      config.llmToken = sessionToken || sessionCookie;
    } else {
      console.log(chalk.green('✅ Session validated successfully!'));
      config.llmToken = sessionCookie;
    }

    console.log(chalk.green('✓ Claude session token saved!'));
  } else {
    console.log();
    console.log(chalk.cyan('You\'ll need an Anthropic API key.'));
    console.log(chalk.gray('Get one at: https://console.anthropic.com/settings/keys'));
    console.log();

    const { apiKey } = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: 'Enter your Anthropic API key:',
      mask: '*',
      validate: (input) => {
        if (!input) return 'API key is required';
        if (!input.startsWith('sk-ant-')) return 'Invalid API key format';
        return true;
      }
    });

    config.apiKey = apiKey;
    console.log(chalk.green('✓ API key saved!'));
  }

  return config;
}

async function authenticateGemini(config: ProviderAuthConfig): Promise<ProviderAuthConfig> {
  console.log();
  console.log(chalk.cyan('Gemini requires a Google AI Studio API key.'));
  console.log(chalk.gray('Get one at: https://makersuite.google.com/app/apikey'));
  console.log();

  // Open the URL for convenience
  await open('https://makersuite.google.com/app/apikey');

  const { apiKey } = await inquirer.prompt({
    type: 'password',
    name: 'apiKey',
    message: 'Enter your Google AI API key:',
    mask: '*',
    validate: (input) => {
      if (!input) return 'API key is required';
      if (!input.startsWith('AIza')) return 'Invalid API key format';
      return true;
    }
  });

  config.apiKey = apiKey;
  console.log(chalk.green('✓ API key saved!'));

  return config;
}

async function authenticatePerplexity(config: ProviderAuthConfig): Promise<ProviderAuthConfig> {
  console.log();
  console.log(chalk.cyan('Perplexity requires an API key.'));
  console.log(chalk.gray('Get one at: https://www.perplexity.ai/settings/api'));
  console.log();

  // Open the URL for convenience
  await open('https://www.perplexity.ai/settings/api');

  const { apiKey } = await inquirer.prompt({
    type: 'password',
    name: 'apiKey',
    message: 'Enter your Perplexity API key:',
    mask: '*',
    validate: (input) => {
      if (!input) return 'API key is required';
      if (!input.startsWith('pplx-')) return 'Invalid API key format';
      return true;
    }
  });

  config.apiKey = apiKey;
  console.log(chalk.green('✓ API key saved!'));

  return config;
}

async function saveProviderConfig(config: ProviderAuthConfig) {
  console.log(chalk.gray('💾 Saving credentials to database...'));

  try {
    // Save to database via AuthService
    const authService = new AuthService();

    // Check if user is authenticated with CacheGPT
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) {
      console.log(chalk.yellow('⚠️ Not logged in to CacheGPT - credentials saved locally only'));
      await saveProviderConfigLocally(config);
      return;
    }

    // Save provider credentials to database
    const { createClient } = await import('@supabase/supabase-js');

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
      console.log(chalk.yellow('⚠️ Database not configured - credentials saved locally only'));
      await saveProviderConfigLocally(config);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert provider credentials to database
    const { error } = await supabase
      .from('user_provider_credentials')
      .upsert({
        user_id: currentUser.id,
        provider: config.provider,
        user_email: config.userEmail,
        llm_token: config.llmToken ? encrypt(config.llmToken) : null,
        api_key: config.apiKey ? encrypt(config.apiKey) : null,
        session_token: encrypt(config.sessionToken),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (error) {
      console.log(chalk.yellow(`⚠️ Database save failed: ${error.message} - saving locally`));
      await saveProviderConfigLocally(config);
      return;
    }

    console.log(chalk.green('✅ Credentials saved to database successfully!'));

    // Also save locally as backup
    await saveProviderConfigLocally(config);

  } catch (error: any) {
    console.log(chalk.yellow(`⚠️ Database error: ${error.message} - saving locally`));
    await saveProviderConfigLocally(config);
  }
}

async function saveProviderConfigLocally(config: ProviderAuthConfig) {
  const configDir = path.join(os.homedir(), '.cachegpt');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  const configPath = path.join(configDir, 'provider-config.json');

  // Encrypt sensitive data before saving
  const encryptedConfig = {
    ...config,
    apiKey: config.apiKey ? encrypt(config.apiKey) : undefined,
    llmToken: config.llmToken ? encrypt(config.llmToken) : undefined,
    sessionToken: encrypt(config.sessionToken),
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    configPath,
    JSON.stringify(encryptedConfig, null, 2),
    { mode: 0o600 }
  );
}

function encrypt(text: string): string {
  // Simple base64 encoding for now - in production, use proper encryption
  return Buffer.from(text).toString('base64');
}

/**
 * Test if the Claude session is valid by making a simple API call
 */
async function testClaudeSession(sessionCookie: string): Promise<boolean> {
  try {
    const headers: any = {
      'Cookie': `sessionKey=${sessionCookie}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://claude.ai',
      'Referer': 'https://claude.ai/'
    };

    // Try to get conversation list or user info
    const response = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}