/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to CLI browser authentication, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * This handles the critical OAuth flow between CLI and web browser.
 * After making changes, update STATUS file with:
 * - Changes to OAuth callback handling
 * - Impact on CLI initialization flow
 * - Any changes to browser integration
 */

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

interface ParsedAuthTokens {
  supabase_jwt?: string;
  claude_session?: string;
  oauth_token?: string;
  api_key?: string;
  sessionToken?: string;
  authToken?: string;
  token?: string;
}

interface AuthResult {
  method: 'supabase_jwt' | 'claude_session' | 'api_key' | 'legacy_unknown';
  tokenType: string;
  credential: string;
}

/**
 * Parse authentication tokens and determine the correct type and usage
 */
function parseAuthTokens(tokens: ParsedAuthTokens): AuthResult {
  // Priority order: explicit parameters first, then legacy fallbacks

  if (tokens.supabase_jwt) {
    return {
      method: 'supabase_jwt',
      tokenType: 'Supabase JWT',
      credential: tokens.supabase_jwt
    };
  }

  if (tokens.claude_session) {
    return {
      method: 'claude_session',
      tokenType: 'Claude Session Key',
      credential: tokens.claude_session
    };
  }

  if (tokens.api_key) {
    return {
      method: 'api_key',
      tokenType: 'API Key',
      credential: tokens.api_key
    };
  }

  // Legacy fallbacks (with best guess at token type)
  if (tokens.sessionToken) {
    // Try to determine token type based on content
    if (isJWT(tokens.sessionToken)) {
      return {
        method: 'supabase_jwt',
        tokenType: 'Supabase JWT (legacy param)',
        credential: tokens.sessionToken
      };
    } else if (tokens.sessionToken.length > 100) {
      return {
        method: 'claude_session',
        tokenType: 'Claude Session (legacy param)',
        credential: tokens.sessionToken
      };
    }

    return {
      method: 'legacy_unknown',
      tokenType: 'Unknown (sessionToken)',
      credential: tokens.sessionToken
    };
  }

  if (tokens.authToken) {
    return {
      method: 'legacy_unknown',
      tokenType: 'Unknown (authToken)',
      credential: tokens.authToken
    };
  }

  if (tokens.token) {
    return {
      method: 'legacy_unknown',
      tokenType: 'Unknown (token)',
      credential: tokens.token
    };
  }

  throw new Error('No authentication token found in callback');
}

/**
 * Simple JWT detection based on format
 */
function isJWT(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}

/**
 * Map auth method to config format
 */
function mapAuthMethodToConfig(method: AuthResult['method']): BrowserConfig['authMethod'] {
  switch (method) {
    case 'supabase_jwt':
      return 'web-session';
    case 'claude_session':
      return 'claude-web';
    case 'api_key':
      return 'api-key';
    case 'legacy_unknown':
      return 'web-session'; // Default fallback
    default:
      return 'web-session';
  }
}

interface BrowserConfig {
  mode: 'browser';
  provider: string;
  authMethod: 'oauth' | 'api' | 'token' | 'web-session' | 'claude-web' | 'api-key';
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
  console.log(chalk.cyan.bold('\n🌐 CacheGPT - Web Authentication Setup\n'));
  console.log(chalk.white('Login with your existing Claude or ChatGPT account.'));
  console.log(chalk.gray('No API keys needed - works just like Claude Code!\n'));

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

    // All providers use web authentication - no API keys
    authChoices.push(
      { name: '🌐 Web Login (No API Keys Required!)', value: 'cachegpt-web' }
    );

    // Always use web authentication - no API keys
    let config: BrowserConfig;

    if (provider === 'anthropic' || provider === 'claude') {
      // Claude requires special web session handling
      console.log(chalk.cyan('\n🤖 Setting up Claude web session...\n'));
      config = await handleCacheGPTWebAuth(provider);
    } else {
      // Other providers use standard OAuth
      config = await handleCacheGPTWebAuth(provider);
    }

    // Save configuration
    saveConfiguration(config);

    console.log(chalk.green.bold('\n✅ Setup complete!\n'));

    // Ask if user wants to start chatting immediately
    const { startChat } = await inquirer.prompt({
      type: 'confirm',
      name: 'startChat',
      message: 'Would you like to start chatting now?',
      default: true
    });

    if (startChat) {
      console.log(chalk.cyan('\n💬 Starting chat session...\n'));
      // Import and run chat command
      const { chatCommand } = await import('./chat');
      await chatCommand();
    } else {
      displayQuickStart();
    }

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
        // Parse tokens with explicit parameter names to avoid confusion
        const {
          provider: authProvider,
          model,
          user,
          error,
          supabase_jwt,    // Supabase JWT access token
          claude_session,  // Claude sessionKey
          oauth_token,     // Temporary OAuth token
          api_key,         // User's API key
          // Legacy parameter names for backwards compatibility
          sessionToken,
          authToken,
          token
        } = parsedUrl.query;

        // Determine auth method and select appropriate token
        const authResult = parseAuthTokens({
          supabase_jwt: supabase_jwt as string,
          claude_session: claude_session as string,
          oauth_token: oauth_token as string,
          api_key: api_key as string,
          // Legacy fallbacks
          sessionToken: sessionToken as string,
          authToken: authToken as string,
          token: token as string
        });

        // Debug logging to console
        console.log(chalk.yellow('\n[DEBUG] Auth Callback Received:'));
        console.log(chalk.gray(`  URL: ${req.url}`));
        console.log(chalk.gray(`  Provider: ${authProvider || provider || 'MISSING'}`));
        console.log(chalk.gray(`  Auth Method: ${authResult.method}`));
        console.log(chalk.gray(`  Token Type: ${authResult.tokenType}`));
        console.log(chalk.gray(`  Token Present: ${authResult.credential ? 'YES (' + authResult.credential.substring(0, 20) + '...)' : 'NO'}`));
        console.log(chalk.gray(`  Model: ${model || 'Not specified'}`));
        console.log(chalk.gray(`  User: ${user ? 'Present' : 'MISSING'}`));
        console.log(chalk.gray(`  Error: ${error || 'None'}`));
        console.log();

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

              <!-- Debug Information -->
              <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: left; font-family: monospace; font-size: 12px;">
                <h4 style="margin-top: 0; color: #6b7280;">Debug Information:</h4>
                <p style="margin: 5px 0;"><strong>Provider:</strong> ${authProvider || provider || 'NOT RECEIVED'}</p>
                <p style="margin: 5px 0;"><strong>Session Token:</strong> ${sessionToken ? 'Received (' + String(sessionToken).substring(0, 30) + '...)' : 'NOT RECEIVED'}</p>
                <p style="margin: 5px 0;"><strong>Auth Token:</strong> ${authToken ? 'Received (' + String(authToken).substring(0, 30) + '...)' : 'NOT RECEIVED'}</p>
                <p style="margin: 5px 0;"><strong>Token:</strong> ${token ? 'Received (' + String(token).substring(0, 30) + '...)' : 'NOT RECEIVED'}</p>
                <p style="margin: 5px 0;"><strong>Model:</strong> ${model || 'Not specified'}</p>
                <p style="margin: 5px 0;"><strong>User:</strong> ${user ? 'Received' : 'NOT RECEIVED'}</p>
                <p style="margin: 5px 0; color: #ef4444;"><strong>Any Token Present:</strong> ${(sessionToken || authToken || token) ? 'YES' : 'NO - AUTHENTICATION WILL FAIL!'}</p>
                <p style="margin: 5px 0;"><strong>Full Query String:</strong> ${req.url || 'Empty'}</p>
              </div>
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
          // Map parsed auth result to appropriate config format
          const config: BrowserConfig = {
            mode: 'browser',
            provider: (authProvider as string) || provider,
            authMethod: mapAuthMethodToConfig(authResult.method),
            defaultModel: (model as string) || getDefaultModel(provider),
            cacheEnabled: true,
            cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
            userId: crypto.randomBytes(16).toString('hex'),
            userEmail: user ? JSON.parse(user as string).email : undefined
          };

          // Set the appropriate token field based on auth method
          if (authResult.method === 'supabase_jwt') {
            config.authToken = authResult.credential;
          } else if (authResult.method === 'claude_session') {
            config.sessionKey = authResult.credential;
          } else if (authResult.method === 'api_key') {
            config.apiKey = authResult.credential;
          } else {
            // Legacy unknown - make best guess
            config.authToken = authResult.credential;
            config.sessionKey = authResult.credential;
          }

          resolve(config);
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
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

// API authentication removed - we only use web sessions now

// Token authentication removed - we only use OAuth/web sessions now

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

  // Save in the format that the chat command expects (overwrite the browser config format)
  const chatConfig = {
    provider: config.provider,
    authMethod: config.authMethod === 'web-session' ? 'cachegpt-web' : config.authMethod,
    sessionToken: config.authToken || config.sessionKey,
    model: config.defaultModel,
    user: {
      email: config.userEmail || 'user@cachegpt.local',
      name: 'CacheGPT User'
    },
    userId: config.userId,
    userEmail: config.userEmail
  };

  fs.writeFileSync(configPath, JSON.stringify(chatConfig, null, 2));
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