import inquirer from 'inquirer';
import chalk from 'chalk';
import open from 'open';
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { saveConfig, getConfigPath } from '../lib/config';
import { logError, logSuccess } from '../lib/utils';

interface BrowserConfig {
  mode: 'browser';
  provider: string;
  authToken?: string;
  apiKey?: string;
  defaultModel: string;
  cacheEnabled: boolean;
  cacheLocation: string;
  userId?: string;
}

const PROVIDER_URLS = {
  openai: 'https://chat.openai.com',
  anthropic: 'https://claude.ai',
  google: 'https://gemini.google.com',
  perplexity: 'https://www.perplexity.ai',
  poe: 'https://poe.com'
};

export async function initBrowserCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan.bold('\n🌐 CacheGPT - Browser Authentication Setup\n'));
  console.log(chalk.white('Sign in to your LLM service through your browser.'));
  console.log(chalk.gray('Simple and secure - no browser automation needed!\n'));

  try {
    // Step 1: Choose provider
    const { provider } = await inquirer.prompt([{
      type: 'list',
      name: 'provider',
      message: 'Which service would you like to use?',
      choices: [
        { name: '💬 ChatGPT (OpenAI)', value: 'openai' },
        { name: '🤖 Claude (Anthropic)', value: 'anthropic' },
        { name: '✨ Gemini (Google)', value: 'google' },
        { name: '🔍 Perplexity AI', value: 'perplexity' },
        { name: '🎭 Poe (Multiple Models)', value: 'poe' }
      ]
    }]);

    const providerUrl = PROVIDER_URLS[provider as keyof typeof PROVIDER_URLS];

    // Step 2: Choose authentication method
    const { authMethod } = await inquirer.prompt([{
      type: 'list',
      name: 'authMethod',
      message: 'How would you like to authenticate?',
      choices: [
        { name: '🔑 API Key (Recommended)', value: 'api' },
        { name: '🌐 Browser Session Token', value: 'token' },
        { name: '🔗 OAuth (Local Callback)', value: 'oauth' }
      ]
    }]);

    if (authMethod === 'api') {
      await handleAPIAuth(provider);
    } else if (authMethod === 'token') {
      await handleTokenAuth(provider, providerUrl);
    } else if (authMethod === 'oauth') {
      await handleOAuthAuth(provider, providerUrl);
    }

    console.log(chalk.green.bold('\n✅ Setup complete!\n'));
    displayQuickStart();

  } catch (error: any) {
    logError('Setup failed:', error);
  }
}

async function handleAPIAuth(provider: string): Promise<void> {
  console.log(chalk.cyan('\n🔑 API Key Authentication\n'));

  const providerInstructions: Record<string, string> = {
    openai: 'Get your API key from: https://platform.openai.com/api-keys',
    anthropic: 'Get your API key from: https://console.anthropic.com/settings/keys',
    google: 'Get your API key from: https://makersuite.google.com/app/apikey',
    perplexity: 'Get your API key from: https://www.perplexity.ai/settings/api',
    poe: 'Get your API key from the Poe developer settings'
  };

  console.log(chalk.gray(providerInstructions[provider] || 'Get your API key from the provider\'s dashboard'));
  console.log();

  const { apiKey } = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: 'Enter your API key:',
    mask: '*',
    validate: (input) => input.length > 0 || 'API key is required'
  }]);

  // Save configuration
  const config: BrowserConfig = {
    mode: 'browser',
    provider,
    apiKey: encryptData(apiKey),
    defaultModel: getDefaultModel(provider),
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId: crypto.randomBytes(16).toString('hex')
  };

  saveConfiguration(config);
}

async function handleTokenAuth(provider: string, providerUrl: string): Promise<void> {
  console.log(chalk.cyan('\n🌐 Browser Session Token Authentication\n'));

  console.log(chalk.yellow('Instructions:'));
  console.log('1. Your browser will open to ' + providerUrl);
  console.log('2. Log in to your account');
  console.log('3. Open Developer Tools (F12)');
  console.log('4. Go to Application/Storage → Cookies');
  console.log('5. Find and copy the session token');
  console.log(chalk.gray('   (Usually named: __Secure-next-auth.session-token, sessionKey, or similar)\n'));

  // Open browser
  await open(providerUrl);

  const { token } = await inquirer.prompt([{
    type: 'password',
    name: 'token',
    message: 'Paste your session token here:',
    mask: '*',
    validate: (input) => input.length > 0 || 'Session token is required'
  }]);

  // Save configuration
  const config: BrowserConfig = {
    mode: 'browser',
    provider,
    authToken: encryptData(token),
    defaultModel: getDefaultModel(provider),
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId: crypto.randomBytes(16).toString('hex')
  };

  saveConfiguration(config);
}

async function handleOAuthAuth(provider: string, providerUrl: string): Promise<void> {
  console.log(chalk.cyan('\n🔗 OAuth Authentication\n'));

  // Start local server to capture OAuth callback
  const port = 8765;
  const app = express();
  let authData: any = null;

  const server = app.listen(port);

  app.get('/callback', (req, res) => {
    authData = req.query;
    res.send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>✅ Authentication Successful!</h1>
          <p>You can close this window and return to the terminal.</p>
          <script>setTimeout(() => window.close(), 2000);</script>
        </body>
      </html>
    `);
    server.close();
  });

  // Build OAuth URL with callback
  const callbackUrl = `http://localhost:${port}/callback`;
  const oauthUrl = `${providerUrl}?callback=${encodeURIComponent(callbackUrl)}`;

  console.log(chalk.yellow('Opening browser for authentication...'));
  console.log(chalk.gray(`Callback URL: ${callbackUrl}\n`));

  // Open browser
  await open(oauthUrl);

  // Wait for callback
  console.log(chalk.cyan('Waiting for authentication...'));

  await new Promise<void>((resolve) => {
    const checkInterval = setInterval(() => {
      if (authData) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      server.close();
      resolve();
    }, 120000);
  });

  if (!authData) {
    throw new Error('Authentication timed out');
  }

  // Save configuration
  const config: BrowserConfig = {
    mode: 'browser',
    provider,
    authToken: encryptData(JSON.stringify(authData)),
    defaultModel: getDefaultModel(provider),
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId: authData.user_id || crypto.randomBytes(16).toString('hex')
  };

  saveConfiguration(config);
}

function encryptData(data: string): string {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(os.hostname(), 'salt', 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return JSON.stringify({
    data: encrypted,
    iv: iv.toString('hex')
  });
}

function saveConfiguration(config: BrowserConfig): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4';
    case 'anthropic':
      return 'claude-3-opus';
    case 'google':
      return 'gemini-pro';
    case 'perplexity':
      return 'llama-3-sonar';
    case 'poe':
      return 'Claude-3-Opus';
    default:
      return 'default';
  }
}

function displayQuickStart() {
  console.log(chalk.cyan('🎉 Quick Start Guide\n'));

  const commands = [
    {
      command: 'cachegpt chat',
      description: 'Start chatting with your chosen LLM'
    },
    {
      command: 'cachegpt stats',
      description: 'View usage and cache statistics'
    },
    {
      command: 'cachegpt clear',
      description: 'Clear cached responses'
    }
  ];

  commands.forEach(({ command, description }) => {
    console.log(chalk.white.bold(`  ${command}`));
    console.log(chalk.gray(`  ${description}\n`));
  });

  console.log(chalk.yellow('💡 Your credentials are encrypted and stored locally.'));
  console.log(chalk.yellow('   No browser automation needed!\n'));
}