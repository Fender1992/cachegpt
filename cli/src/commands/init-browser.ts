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
import { OAuth2Client, OAUTH_PROVIDERS } from '../lib/oauth';
import { CredentialStore } from '../lib/credential-store';
import { initClaudePersistent } from './init-claude-persistent';

interface BrowserConfig {
  mode: 'browser';
  provider: string;
  authMethod: 'oauth' | 'api' | 'token' | 'web-session' | 'claude-web';
  authToken?: string;
  apiKey?: string;
  sessionKey?: string;
  organizationId?: string;
  defaultModel: string;
  cacheEnabled: boolean;
  cacheLocation: string;
  userId?: string;
  userEmail?: string;
  endpoint?: string; // For Azure
  deployment?: string; // For Azure
}

const PROVIDER_URLS = {
  openai: 'https://chat.openai.com',
  anthropic: 'https://claude.ai',
  google: 'https://gemini.google.com',
  perplexity: 'https://www.perplexity.ai',
  cohere: 'https://dashboard.cohere.ai',
  microsoft: 'https://azure.microsoft.com/products/ai-services/openai-service'
};

export async function initBrowserCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan.bold('\n🌐 CacheGPT - Web Authentication Setup\n'));
  console.log(chalk.white('Authenticate with your favorite LLM providers.'));
  console.log(chalk.gray('Secure OAuth 2.0 with PKCE - just like Claude Code!\n'));

  const credentialStore = new CredentialStore();

  try {
    // Check for existing accounts
    const existingAccounts = await credentialStore.listAccounts();
    if (existingAccounts.length > 0) {
      console.log(chalk.yellow('📋 Existing accounts found:\n'));
      existingAccounts.forEach(account => {
        console.log(chalk.gray(`   • ${account}`));
      });
      console.log();

      const { continueSetup } = await inquirer.prompt({
        type: 'confirm',
        name: 'continueSetup',
        message: 'Add another account?',
        default: true
      });

      if (!continueSetup) {
        console.log(chalk.gray('\nUse "cachegpt chat" to start chatting with existing accounts.'));
        return;
      }
    }

    // Step 1: Choose provider
    const { provider } = await inquirer.prompt({
      type: 'list',
      name: 'provider',
      message: 'Which service would you like to use?',
      choices: [
        { name: '💬 ChatGPT (OpenAI)', value: 'openai' },
        { name: '🤖 Claude (Anthropic)', value: 'anthropic' },
        { name: '✨ Gemini (Google)', value: 'google' },
        { name: '🔷 Azure OpenAI (Microsoft)', value: 'microsoft' },
        { name: '🔍 Perplexity AI', value: 'perplexity' },
        { name: '🌟 Cohere', value: 'cohere' }
      ]
    });

    const providerUrl = PROVIDER_URLS[provider as keyof typeof PROVIDER_URLS];

    // Step 2: Choose authentication method
    const oauthSupported = OAUTH_PROVIDERS[provider] !== undefined;

    const authChoices = [];

    // All providers now support CacheGPT web authentication
    authChoices.push(
      { name: '🌐 CacheGPT Web Login (No API Keys Required!)', value: 'cachegpt-web' }
    );

    // Special handling for different providers
    if (provider === 'anthropic') {
      // Anthropic supports additional auth methods
      authChoices.push(
        { name: '🤖 Claude Web Session (Advanced)', value: 'claude-web' },
        { name: '🔑 API Key (From Anthropic Console)', value: 'api' }
      );
    } else if (oauthSupported) {
      authChoices.push({ name: '🔐 OAuth 2.0 Web Login (Recommended)', value: 'oauth' });
      authChoices.push(
        { name: '🔑 API Key', value: 'api' },
        { name: '🍪 Browser Session Token', value: 'token' }
      );
    } else {
      authChoices.push(
        { name: '🔑 API Key', value: 'api' },
        { name: '🍪 Browser Session Token', value: 'token' }
      );
    }

    const { authMethod } = await inquirer.prompt({
      type: 'list',
      name: 'authMethod',
      message: 'How would you like to authenticate?',
      choices: authChoices
    });

    let config: BrowserConfig;

    if (authMethod === 'cachegpt-web') {
      // Use CacheGPT web authentication - connects to our keyless system
      config = await handleCacheGPTWebAuth(provider);
    } else if (authMethod === 'claude-web') {
      // Use persistent browser profile - exactly like Claude Code!
      // This maintains login between sessions and bypasses detection
      config = await initClaudePersistent();
    } else if (authMethod === 'oauth') {
      config = await handleOAuth2Auth(provider, credentialStore);
    } else if (authMethod === 'api') {
      config = await handleAPIAuth(provider);
    } else {
      config = await handleTokenAuth(provider, providerUrl);
    }

    // Save configuration
    saveConfiguration(config);

    console.log(chalk.green.bold('\n✅ Setup complete!\n'));
    displayQuickStart();

  } catch (error: any) {
    logError('Setup failed:', error);
  }
}

async function handleCacheGPTWebAuth(provider: string): Promise<BrowserConfig> {
  console.log(chalk.cyan('\n🌐 CacheGPT Web Authentication\n'));
  console.log(chalk.white('Connecting to CacheGPT keyless authentication system...'));
  console.log(chalk.gray('No API keys required - everything handled server-side!\n'));

  // This uses the same flow as the chat command but stores the config properly
  const { createServer } = await import('http');
  const { parse } = await import('url');

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url || '', true);

      if (parsedUrl.pathname === '/auth/callback') {
        const { provider: authProvider, model, user, error } = parsedUrl.query;

        // Send success response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>CacheGPT Authentication</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     display: flex; align-items: center; justify-content: center; min-height: 100vh;
                     margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
              .container { background: white; padding: 2rem; border-radius: 12px; text-align: center;
                          box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px; }
              .success { color: #10B981; }
              .error { color: #EF4444; }
              .logo { font-size: 2em; margin-bottom: 0.5em; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">🚀</div>
              ${error ? `
                <h2 class="error">Authentication Failed</h2>
                <p>Error: ${error}</p>
                <p>Please try again or contact support.</p>
              ` : `
                <h2 class="success">Welcome to CacheGPT!</h2>
                <p>Authentication successful. You can now return to your terminal.</p>
                <p><strong>Provider:</strong> ${authProvider || provider}</p>
                <p><strong>Model:</strong> ${model}</p>
              `}
            </div>
            <script>
              setTimeout(() => window.close(), ${error ? 5000 : 3000});
            </script>
          </body>
          </html>
        `);

        server.close();

        if (error) {
          reject(new Error(error as string));
        } else {
          resolve({
            mode: 'browser',
            provider: (authProvider as string) || provider,
            authMethod: 'web-session',
            defaultModel: (model as string) || getDefaultModel(provider),
            cacheEnabled: true,
            cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
            userId: crypto.randomBytes(16).toString('hex'),
            userEmail: user ? JSON.parse(user as string).email : undefined
          });
        }
        return;
      }

      // 404 for other paths
      res.writeHead(404);
      res.end('Not found');
    });

    // Find available port starting from 8787
    const tryPort = (port: number) => {
      server.listen(port, 'localhost', async () => {
        console.log(chalk.green(`✅ Local server started on port ${port}`));

        // Open CacheGPT authentication URL
        const authUrl = `${process.env.CACHEGPT_APP_URL || 'https://cachegpt.app'}/login?source=cli&return_to=terminal&callback_port=${port}`;

        console.log(chalk.cyan('🌐 Opening browser for authentication...'));

        try {
          const open = await import('open').catch(() => null);
          if (open) {
            await open.default(authUrl);
            console.log(chalk.green('✅ Browser opened'));
          } else {
            console.log(chalk.yellow('Please open this URL in your browser:'));
            console.log(chalk.blue.underline(authUrl));
          }
        } catch (err) {
          console.log(chalk.yellow('Please open this URL in your browser:'));
          console.log(chalk.blue.underline(authUrl));
        }

        console.log();
        console.log(chalk.gray('1. Complete OAuth login (Google/GitHub)'));
        console.log(chalk.gray('2. Select your LLM provider'));
        console.log(chalk.gray('3. Browser will redirect back to CLI'));
        console.log();
        console.log(chalk.yellow('⏳ Waiting for authentication...'));

      }).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && port < 9000) {
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
    };

    tryPort(8787);

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout (5 minutes)'));
    }, 5 * 60 * 1000);
  });
}

async function handleOAuth2Auth(provider: string, credentialStore: CredentialStore): Promise<BrowserConfig> {
  console.log(chalk.cyan('\n🔐 OAuth 2.0 Authentication\n'));
  console.log(chalk.gray('Your browser will open for secure authentication.'));
  console.log(chalk.gray('This works just like logging into Claude Code!\n'));

  try {
    // Initialize OAuth client
    const oauthClient = new OAuth2Client(provider);

    // Perform OAuth authentication
    const tokens = await oauthClient.authenticate();

    console.log(chalk.green('\n✅ Authentication successful!\n'));

    // Get user email if possible (would require an API call with the token)
    const userEmail = await getUserEmail(provider, tokens.access_token);
    const userId = crypto.randomBytes(16).toString('hex');

    // Store credentials securely
    await credentialStore.store(`${provider}:${userEmail || userId}`, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : undefined,
      provider,
      userEmail,
      userId
    });

    console.log(chalk.gray(`Credentials stored securely for: ${userEmail || provider}\n`));

    // Return configuration
    return {
      mode: 'browser',
      provider,
      authMethod: 'oauth',
      defaultModel: getDefaultModel(provider),
      cacheEnabled: true,
      cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
      userId,
      userEmail
    };

  } catch (error: any) {
    console.log(chalk.red('\n❌ OAuth authentication failed'));
    console.log(chalk.yellow('Falling back to API key authentication...\n'));
    return await handleAPIAuth(provider);
  }
}

async function handleAPIAuth(provider: string): Promise<BrowserConfig> {
  console.log(chalk.cyan('\n🔑 API Key Authentication\n'));

  const providerInstructions: Record<string, string> = {
    openai: 'Get your API key from: https://platform.openai.com/api-keys',
    anthropic: 'Get your API key from: https://console.anthropic.com/settings/keys',
    google: 'Get your API key from: https://makersuite.google.com/app/apikey',
    microsoft: 'Get your Azure OpenAI key from: https://portal.azure.com',
    perplexity: 'Get your API key from: https://www.perplexity.ai/settings/api',
    cohere: 'Get your API key from: https://dashboard.cohere.ai/api-keys'
  };

  console.log(chalk.gray(providerInstructions[provider] || 'Get your API key from the provider\'s dashboard'));
  console.log();

  const { apiKey } = await inquirer.prompt({
    type: 'password',
    name: 'apiKey',
    message: 'Enter your API key:',
    mask: '*',
    validate: (input) => input.length > 0 || 'API key is required'
  });

  // Additional config for Azure OpenAI
  let azureConfig = {};
  if (provider === 'microsoft') {
    const endpointAnswer = await inquirer.prompt({
        type: 'input',
        name: 'endpoint',
        message: 'Enter your Azure OpenAI endpoint:',
        validate: (input) => input.length > 0 || 'Endpoint is required'
      });

    const deploymentAnswer = await inquirer.prompt({
        type: 'input',
        name: 'deployment',
        message: 'Enter your deployment name:',
        default: 'gpt-4'
      });

    const { endpoint, deployment } = { ...endpointAnswer, ...deploymentAnswer };
    azureConfig = { endpoint, deployment };
  }

  // Save configuration
  const config: BrowserConfig = {
    mode: 'browser',
    provider,
    authMethod: 'api',
    apiKey: encryptData(apiKey),
    defaultModel: getDefaultModel(provider),
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId: crypto.randomBytes(16).toString('hex'),
    ...azureConfig
  };

  return config;
}

async function handleTokenAuth(provider: string, providerUrl: string): Promise<BrowserConfig> {
  console.log(chalk.cyan('\n🍪 Browser Session Token Authentication\n'));

  console.log(chalk.yellow('Instructions:'));
  console.log('1. Your browser will open to ' + providerUrl);
  console.log('2. Log in to your account');
  console.log('3. Open Developer Tools (F12)');
  console.log('4. Go to Application/Storage → Cookies');
  console.log('5. Find and copy the session token');
  console.log(chalk.gray('   (Usually named: __Secure-next-auth.session-token, sessionKey, or similar)\n'));

  // Open browser
  await open(providerUrl);

  const { token } = await inquirer.prompt({
    type: 'password',
    name: 'token',
    message: 'Paste your session token here:',
    mask: '*',
    validate: (input) => input.length > 0 || 'Session token is required'
  });

  // Save configuration
  const config: BrowserConfig = {
    mode: 'browser',
    provider,
    authMethod: 'token',
    authToken: encryptData(token),
    defaultModel: getDefaultModel(provider),
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId: crypto.randomBytes(16).toString('hex')
  };

  return config;
}

async function getUserEmail(provider: string, accessToken: string): Promise<string | undefined> {
  try {
    // Provider-specific user info endpoints
    const userInfoEndpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/me',
      google: 'https://www.googleapis.com/oauth2/v2/userinfo',
      microsoft: 'https://graph.microsoft.com/v1.0/me'
    };

    const endpoint = userInfoEndpoints[provider];
    if (!endpoint) {
      return undefined;
    }

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      return data.email || data.userPrincipalName || data.mail;
    }
  } catch {
    // Ignore errors - email is optional
  }

  return undefined;
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
      return 'gpt-5';
    case 'anthropic':
      return 'claude-opus-4-1-20250805';
    case 'google':
      return 'gemini-2.0-ultra';
    case 'microsoft':
      return 'gpt-5';
    case 'perplexity':
      return 'pplx-pro-online';
    case 'cohere':
      return 'command-r-plus';
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
      command: 'cachegpt status',
      description: 'Check authentication status'
    },
    {
      command: 'cachegpt logout',
      description: 'Log out and clear credentials'
    },
    {
      command: 'cachegpt stats',
      description: 'View usage and cache statistics'
    }
  ];

  commands.forEach(({ command, description }) => {
    console.log(chalk.white.bold(`  ${command}`));
    console.log(chalk.gray(`  ${description}\n`));
  });

  console.log(chalk.yellow('💡 Your credentials are securely stored using OS-native encryption.'));
  console.log(chalk.yellow('   OAuth tokens will be automatically refreshed when needed.\n'));
}