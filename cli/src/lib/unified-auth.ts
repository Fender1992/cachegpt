import { chromium, Browser, BrowserContext, Page } from 'playwright';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ora from 'ora';
import { TokenManager, AuthToken } from './token-manager';

export interface UnifiedAuthConfig {
  provider: string;
  authMethod: 'web-session' | 'api-key';
  credential: string;  // Either session cookie or API key
  model?: string;
  organizationId?: string;
  conversationId?: string;
  userEmail?: string;
}

export interface ProviderConfig {
  name: string;
  url: string;
  loginSelectors: string[];
  sessionCookieName?: string;
  defaultModel: string;
  apiKeyInstructions?: string;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    loginSelectors: [
      'textarea',
      'div[contenteditable="true"]',
      '[placeholder*="Message"]',
      'button:has-text("New chat")'
    ],
    sessionCookieName: 'sessionKey',
    defaultModel: 'claude-opus-4-1-20250805',
    apiKeyInstructions: 'Get your API key from https://console.anthropic.com/account/keys'
  },
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    loginSelectors: [
      'textarea[data-id]',
      'div[contenteditable="true"]',
      '[placeholder*="Send a message"]',
      'button[data-testid="send-button"]'
    ],
    sessionCookieName: '__Secure-next-auth.session-token',
    defaultModel: 'gpt-5',
    apiKeyInstructions: 'Get your API key from https://platform.openai.com/api-keys'
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    loginSelectors: [
      'rich-textarea',
      '[contenteditable="true"]',
      '[aria-label*="Talk to Gemini"]',
      'button[aria-label*="Send"]'
    ],
    sessionCookieName: 'SAPISID',
    defaultModel: 'gemini-2.0-ultra',
    apiKeyInstructions: 'Get your API key from https://makersuite.google.com/app/apikey'
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    loginSelectors: [
      'textarea',
      '[placeholder*="Ask"]',
      '[placeholder*="follow-up"]',
      'button[aria-label*="Submit"]'
    ],
    sessionCookieName: '__session',
    defaultModel: 'pplx-pro-online',
    apiKeyInstructions: 'Get your API key from https://www.perplexity.ai/settings/api'
  }
};

export class UnifiedAuthManager {
  private tokenManager: TokenManager;
  private browserProfileDir: string;

  constructor() {
    this.tokenManager = new TokenManager();
    this.browserProfileDir = path.join(os.homedir(), '.cachegpt', 'browser-profiles');
  }

  /**
   * Main authentication method - tries web session first, falls back to API key
   */
  async authenticate(provider: string): Promise<UnifiedAuthConfig> {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    console.log(chalk.cyan.bold(`\n🔐 Authenticating with ${config.name}\n`));

    // Check for existing stored credentials using the new token manager
    const availableMethods = this.tokenManager.getAvailableAuthMethods(provider);

    if (availableMethods.webSession || availableMethods.apiKey) {
      console.log(chalk.green('✅ Found existing authentication'));

      // Prefer web session, fall back to API key
      try {
        const token = this.tokenManager.getCredentialForProvider(provider, true);
        return this.tokenToConfig(provider, token);
      } catch (error) {
        console.log(chalk.yellow('Existing credentials expired or invalid, re-authenticating...'));
      }
    }

    // Ask user preference
    const { authChoice } = await inquirer.prompt({
      type: 'list',
      name: 'authChoice',
      message: 'How would you like to authenticate?',
      choices: [
        {
          name: `🌐 Web Login (Use your ${config.name} subscription - Recommended)`,
          value: 'web'
        },
        {
          name: '🔑 API Key (Requires paid API access)',
          value: 'api'
        }
      ]
    });

    if (authChoice === 'web') {
      try {
        return await this.authenticateViaWeb(provider);
      } catch (error: any) {
        console.log(chalk.yellow('\n⚠️  Web authentication failed:', error.message));
        console.log(chalk.yellow('Falling back to API key authentication...\n'));
        return await this.authenticateViaAPIKey(provider);
      }
    } else {
      return await this.authenticateViaAPIKey(provider);
    }
  }

  /**
   * Convert AuthToken to UnifiedAuthConfig
   */
  private tokenToConfig(provider: string, token: AuthToken): UnifiedAuthConfig {
    const config = PROVIDER_CONFIGS[provider];

    return {
      provider,
      authMethod: token.type.includes('web') ? 'web-session' : 'api-key',
      credential: token.value,
      model: config.defaultModel
    };
  }

  /**
   * Web-based authentication using Playwright
   */
  private async authenticateViaWeb(provider: string): Promise<UnifiedAuthConfig> {
    const config = PROVIDER_CONFIGS[provider];
    const profileDir = path.join(this.browserProfileDir, provider);

    // Create profile directory if needed
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
      console.log(chalk.yellow('📁 Creating browser profile for', config.name));
    }

    const spinner = ora(`Launching browser for ${config.name}...`).start();

    try {
      // Launch persistent browser context
      const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        channel: 'chrome',
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-automation',
          '--no-sandbox'
        ],
        ignoreDefaultArgs: ['--enable-automation']
      });

      let page = context.pages()[0] || await context.newPage();

      spinner.text = `Navigating to ${config.name}...`;
      await page.goto(config.url, { waitUntil: 'domcontentloaded' });
      spinner.stop();

      // Check if already logged in
      const isLoggedIn = await this.checkIfLoggedIn(page, config);

      if (!isLoggedIn) {
        console.log(chalk.cyan(`\n📝 Please log in to ${config.name}`));
        console.log(chalk.gray('The browser will remember your login for next time'));

        // Wait for login
        await this.waitForLogin(page, config);
      } else {
        console.log(chalk.green('✅ Already logged in!'));
      }

      // Extract session cookie
      const sessionCookie = await this.extractSessionCookie(context, config);

      if (!sessionCookie) {
        throw new Error('Could not extract session cookie');
      }

      console.log(chalk.green('✅ Session captured successfully!'));

      await context.close();

      // Save using the TokenManager
      switch (provider) {
        case 'claude':
          this.tokenManager.setClaudeWebSession(sessionCookie);
          break;
        case 'chatgpt':
          this.tokenManager.setChatGPTWebSession(sessionCookie);
          break;
        case 'gemini':
          // Gemini web session not implemented yet
          throw new Error('Gemini web sessions not supported yet');
        default:
          throw new Error(`Web sessions not supported for ${provider}`);
      }

      // Return config
      return {
        provider,
        authMethod: 'web-session',
        credential: sessionCookie,
        model: config.defaultModel
      };

    } catch (error) {
      spinner.stop();
      throw error;
    }
  }

  /**
   * API key authentication fallback
   */
  private async authenticateViaAPIKey(provider: string): Promise<UnifiedAuthConfig> {
    const config = PROVIDER_CONFIGS[provider];

    console.log(chalk.yellow('\n📋 API Key Authentication'));
    if (config.apiKeyInstructions) {
      console.log(chalk.gray(config.apiKeyInstructions));
    }

    const { apiKey } = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${config.name} API key:`,
      mask: '*',
      validate: (input) => {
        if (!input || input.trim().length < 10) {
          return 'Please enter a valid API key';
        }
        return true;
      }
    });

    // Validate the API key by making a test request
    const isValid = await this.validateAPIKey(provider, apiKey);
    if (!isValid) {
      throw new Error('Invalid API key. Please check and try again.');
    }

    console.log(chalk.green('✅ API key validated successfully!'));

    // Save using the TokenManager
    const providerKey = this.mapProviderToAPIKeyType(provider);
    this.tokenManager.setAPIKey(providerKey, apiKey);

    return {
      provider,
      authMethod: 'api-key',
      credential: apiKey,
      model: config.defaultModel
    };
  }

  /**
   * Map provider name to API key provider type
   */
  private mapProviderToAPIKeyType(provider: string): 'openai' | 'anthropic' | 'google' | 'perplexity' {
    switch (provider) {
      case 'chatgpt':
        return 'openai';
      case 'claude':
        return 'anthropic';
      case 'gemini':
        return 'google';
      case 'perplexity':
        return 'perplexity';
      default:
        throw new Error(`Unknown provider for API key: ${provider}`);
    }
  }

  /**
   * Check if user is logged in on the page
   */
  private async checkIfLoggedIn(page: Page, config: ProviderConfig): Promise<boolean> {
    try {
      // Check URL first
      const url = page.url();
      if (url.includes('/chat') || url.includes('/c/')) {
        return true;
      }

      // Check for login selectors
      for (const selector of config.loginSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            return true;
          }
        } catch {}
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Wait for user to complete login
   */
  private async waitForLogin(page: Page, config: ProviderConfig): Promise<void> {
    console.log(chalk.yellow('⏳ Waiting for login...'));

    const maxAttempts = 300; // 5 minutes
    for (let i = 0; i < maxAttempts; i++) {
      await page.waitForTimeout(1000);

      if (await this.checkIfLoggedIn(page, config)) {
        console.log(chalk.green('\n✅ Login successful!'));
        await page.waitForTimeout(3000); // Wait for cookies to be set
        return;
      }

      if (i % 10 === 0 && i > 0) {
        console.log(chalk.gray(`Still waiting... (${i}s)`));
      }
    }

    throw new Error('Login timeout');
  }

  /**
   * Extract session cookie from browser context
   */
  private async extractSessionCookie(context: BrowserContext, config: ProviderConfig): Promise<string | null> {
    const cookies = await context.cookies();

    // Try to find the specific session cookie
    if (config.sessionCookieName) {
      const sessionCookie = cookies.find(c => c.name === config.sessionCookieName);
      if (sessionCookie) {
        return sessionCookie.value;
      }
    }

    // Fallback: look for any session-like cookie
    const sessionCookie = cookies.find(c =>
      c.name.toLowerCase().includes('session') ||
      c.name.toLowerCase().includes('auth') ||
      c.name.toLowerCase().includes('token')
    );

    return sessionCookie?.value || null;
  }

  /**
   * Validate an API key by making a test request
   */
  private async validateAPIKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      switch (provider) {
        case 'chatgpt':
          const openaiResponse = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          return openaiResponse.ok;

        case 'claude':
          const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 1
            })
          });
          // 401 means invalid key, 400 might mean valid but bad request
          return anthropicResponse.status !== 401;

        case 'gemini':
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
          );
          return geminiResponse.ok;

        case 'perplexity':
          const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instruct',
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 1
            })
          });
          return perplexityResponse.status !== 401;

        default:
          return true; // Assume valid for unknown providers
      }
    } catch (error) {
      console.error('API validation error:', error);
      return false;
    }
  }

  /**
   * Get token manager for external access (if needed)
   */
  getTokenManager(): TokenManager {
    return this.tokenManager;
  }
}