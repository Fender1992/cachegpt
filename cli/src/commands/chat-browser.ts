import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig } from '../lib/config';
import { SupabaseCache } from '../lib/supabase-cache';
import { CredentialStore } from '../lib/credential-store';
import { OAuth2Client, isTokenExpired } from '../lib/oauth';
import crypto from 'crypto';
import os from 'os';
import ora from 'ora';
import fetch from 'node-fetch';

interface ChatConfig {
  mode: 'browser';
  provider: string;
  authMethod: 'oauth' | 'api' | 'token' | 'web-session' | 'claude-web';
  authToken?: string;
  apiKey?: string;
  sessionKey?: string;
  organizationId?: string;
  defaultModel: string;
  cacheLocation: string;
  userId?: string;
  userEmail?: string;
  endpoint?: string; // For Azure
  deployment?: string; // For Azure
}

export async function chatBrowserCommand(): Promise<void> {
  const config: ChatConfig = loadConfig() as ChatConfig;

  if (!config || config.mode !== 'browser') {
    console.log(chalk.red('Browser mode not configured. Run "cachegpt init" first.'));
    process.exit(1);
  }

  const cache = new SupabaseCache(config.userId);
  const credentialStore = new CredentialStore();

  console.clear();
  console.log(chalk.cyan.bold('\n💬 CacheGPT Chat\n'));

  // Get credentials based on auth method
  let accessToken: string | null = null;
  let apiKey: string | null = null;

  if (config.authMethod === 'oauth') {
    // Retrieve stored OAuth credentials
    const accounts = await credentialStore.listAccounts();
    let selectedAccount: string | null = null;

    if (accounts.length === 0) {
      console.log(chalk.red('❌ No OAuth credentials found. Please run "cachegpt init" first.'));
      process.exit(1);
    } else if (accounts.length === 1) {
      selectedAccount = accounts[0];
    } else {
      // Let user select account
      const { account } = await inquirer.prompt([{
        type: 'list',
        name: 'account',
        message: 'Select account to use:',
        choices: accounts
      }]);
      selectedAccount = account;
    }

    const credentials = await credentialStore.retrieve(selectedAccount!);
    if (!credentials) {
      console.log(chalk.red('❌ Failed to retrieve credentials. Please run "cachegpt init" again.'));
      process.exit(1);
    }

    // Check if token needs refresh
    if (credentials.expiresAt && isTokenExpired(credentials.expiresAt) && credentials.refreshToken) {
      const oauthClient = new OAuth2Client(config.provider);

      try {
        const newTokens = await oauthClient.refreshToken(credentials.refreshToken);
        credentials.accessToken = newTokens.access_token;
        credentials.refreshToken = newTokens.refresh_token || credentials.refreshToken;
        credentials.expiresAt = newTokens.expires_in ? Date.now() + (newTokens.expires_in * 1000) : undefined;

        // Save updated credentials silently
        await credentialStore.store(selectedAccount!, credentials);
      } catch (error) {
        console.log(chalk.red('❌ Failed to refresh token. Please run "cachegpt init" to re-authenticate.'));
        process.exit(1);
      }
    }

    accessToken = credentials.accessToken;

  } else if (config.authMethod === 'api') {
    // Decrypt API key
    apiKey = decryptData(config.apiKey);
    if (!apiKey) {
      console.log(chalk.red('❌ No valid API key found. Please run "cachegpt init" again.'));
      process.exit(1);
    }

  } else if (config.authMethod === 'token') {
    // Decrypt session token
    accessToken = decryptData(config.authToken);
    if (!accessToken) {
      console.log(chalk.red('❌ No valid session token found. Please run "cachegpt init" again.'));
      process.exit(1);
    }

  } else if (config.authMethod === 'web-session' || config.authMethod === 'claude-web') {
    // Decrypt Claude web session
    accessToken = decryptData(config.sessionKey);
    if (!accessToken) {
      console.log(chalk.red('❌ No valid Claude session found. Please run "cachegpt init" again.'));
      process.exit(1);
    }
  }

  console.log(chalk.gray('Type "exit" to quit, "clear" to clear screen\n'));

  // Chat loop
  while (true) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: chalk.green('You:'),
      prefix: ''
    }]);

    if (input.toLowerCase() === 'exit') {
      console.log(chalk.gray('\nGoodbye! 👋'));
      break;
    }

    if (input.toLowerCase() === 'clear') {
      console.clear();
      continue;
    }

    // Check Supabase cache first
    const startTime = Date.now();
    const cachedResponse = await cache.findSimilar(input, config.defaultModel || config.provider, 0.85);

    if (cachedResponse && cachedResponse.similarity! > 0.85) {
      // Show thinking indicator for adapted responses
      if (cachedResponse.similarity !== 1.0 && cachedResponse.query !== input) {
        const thinkingSpinner = ora(chalk.gray('Thinking...')).start();
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for effect
        thinkingSpinner.stop();
      }

      console.log(chalk.cyan('\nAssistant:'), cachedResponse.response);
      console.log(''); // Add blank line after response

      // Silently track cache hit
      const responseTime = Date.now() - startTime;
      await cache.trackUsage({
        model: config.defaultModel || config.provider,
        tokens_used: Math.ceil(cachedResponse.response.length / 4),
        cache_hit: true,
        response_time_ms: responseTime,
        cost: 0,
        cost_saved: calculateCost(config.provider, Math.ceil(cachedResponse.response.length / 4))
      });
    } else {
      // Send message through API
      const spinner = ora(chalk.gray('Thinking...')).start();

      try {
        const response = await sendMessage(
          config.provider,
          accessToken || apiKey!,
          input,
          config.defaultModel,
          config.authMethod === 'oauth' || config.authMethod === 'token' || config.authMethod === 'web-session' || config.authMethod === 'claude-web',
          config
        );
        spinner.stop();

        if (response) {
          console.log(chalk.cyan('\nAssistant:'), response);
          console.log(''); // Add blank line after response

          // Silently cache the response in Supabase
          const tokens = Math.ceil(response.length / 4);
          const cost = calculateCost(config.provider, tokens);
          await cache.set(input, response, config.defaultModel || config.provider);

          // Silently track usage
          const responseTime = Date.now() - startTime;
          await cache.trackUsage({
            model: config.defaultModel || config.provider,
            tokens_used: tokens,
            cache_hit: false,
            response_time_ms: responseTime,
            cost: cost,
            cost_saved: 0
          });
        } else {
          console.log(chalk.red('\n❌ Failed to get response\n'));
        }
      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red('\n❌ Error:'), error.message, '\n');
      }
    }
  }
}

async function sendMessage(
  provider: string,
  credential: string,
  message: string,
  model: string,
  isOAuth: boolean,
  config: ChatConfig
): Promise<string | null> {
  try {
    switch (provider) {
      case 'openai':
        return await sendToOpenAI(credential, message, model, isOAuth);
      case 'anthropic':
        return await sendToAnthropic(credential, message, model, isOAuth, config);
      case 'google':
        return await sendToGoogle(credential, message, model, isOAuth);
      case 'microsoft':
        return await sendToAzure(credential, message, config);
      case 'perplexity':
        return await sendToPerplexity(credential, message, model, isOAuth);
      case 'cohere':
        return await sendToCohere(credential, message, model, isOAuth);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

async function sendToOpenAI(credential: string, message: string, model: string, isOAuth: boolean): Promise<string | null> {
  const headers: any = {
    'Content-Type': 'application/json'
  };

  if (isOAuth) {
    headers['Authorization'] = `Bearer ${credential}`;
  } else {
    headers['Authorization'] = `Bearer ${credential}`;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'gpt-4-turbo-preview',
      messages: [
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || null;
}

async function sendToAnthropic(credential: string, message: string, model: string, isOAuth: boolean, config?: ChatConfig): Promise<string | null> {
  // Check if this is a Claude Web session
  if (config && (config.authMethod === 'web-session' || config.authMethod === 'claude-web')) {
    return sendToClaudeWeb(credential, message, config);
  }

  // Standard API key authentication
  const headers: any = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  };

  if (isOAuth) {
    headers['Authorization'] = `Bearer ${credential}`;
  } else {
    headers['x-api-key'] = credential;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'claude-3-opus-20240229',
      messages: [
        { role: 'user', content: message }
      ],
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || null;
}

async function sendToClaudeWeb(sessionKey: string, message: string, config: ChatConfig): Promise<string | null> {
  // Claude.ai doesn't have a public API - we need to use browser automation
  // This is similar to how Claude Code actually works

  const { chromium } = await import('playwright');
  const path = await import('path');
  const os = await import('os');
  const fs = await import('fs');

  try {
    // Use the persistent browser profile that was created during login
    const userDataDir = path.join(os.homedir(), '.cachegpt', 'browser-profile');

    // Check if profile exists
    if (!fs.existsSync(userDataDir)) {
      throw new Error('Browser profile not found. Please run "cachegpt init" to set up authentication.');
    }

    // Launch browser with the saved profile
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true, // Run headless for chat
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-automation',
        '--no-sandbox'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    // Get or create a page
    let page = context.pages()[0];
    if (!page) {
      page = await context.newPage();
    }

    // Navigate to Claude
    await page.goto('https://claude.ai/new', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Find and fill the message input
    const inputSelectors = [
      'div[contenteditable="true"]',
      'div.ProseMirror',
      'textarea',
      '[placeholder*="Message"]'
    ];

    let inputElement = null;
    for (const selector of inputSelectors) {
      try {
        inputElement = await page.waitForSelector(selector, { timeout: 5000 });
        if (inputElement) break;
      } catch {}
    }

    if (!inputElement) {
      throw new Error('Could not find message input. Please check your authentication.');
    }

    // Type the message
    await inputElement.click();
    await inputElement.type(message);

    // Send the message
    await page.keyboard.press('Enter');

    // Wait for response to appear
    await page.waitForTimeout(3000);

    // Wait for response to complete (max 30 seconds)
    let responseComplete = false;
    for (let i = 0; i < 30; i++) {
      const isGenerating = await page.evaluate(() => {
        // Check various indicators that response is still generating
        return document.querySelector('button[aria-label*="Stop"]') ||
               document.querySelector('[data-state="generating"]') ||
               document.body.textContent?.includes('Thinking...');
      });

      if (!isGenerating) {
        responseComplete = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    // Extract the response
    const response = await page.evaluate(() => {
      // Get all message elements
      const messages = Array.from(document.querySelectorAll('div')).filter(el => {
        // Look for divs that contain substantial text
        const text = el.innerText || '';
        return text.length > 50 &&
               !text.includes('Message Claude') &&
               el.querySelector('p, pre, code, ul, ol');
      });

      // Return the last message (Claude's response)
      if (messages.length > 0) {
        return messages[messages.length - 1].innerText;
      }
      return null;
    });

    // Close the context
    await context.close();

    return response || 'No response received';

  } catch (error: any) {
    throw new Error(`Claude Web error: ${error.message}`);
  }
}

async function sendToGoogle(credential: string, message: string, model: string, isOAuth: boolean): Promise<string | null> {
  let url: string;
  const headers: any = {
    'Content-Type': 'application/json'
  };

  if (isOAuth) {
    headers['Authorization'] = `Bearer ${credential}`;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent`;
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${credential}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: message
        }]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0]?.content?.parts[0]?.text || null;
}

async function sendToAzure(credential: string, message: string, config: ChatConfig): Promise<string | null> {
  if (!config.endpoint || !config.deployment) {
    throw new Error('Azure OpenAI requires endpoint and deployment configuration');
  }

  const url = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=2024-02-01`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': credential
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || null;
}

async function sendToPerplexity(credential: string, message: string, model: string, isOAuth: boolean): Promise<string | null> {
  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${credential}`
  };

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'llama-3-sonar-large-32k-online',
      messages: [
        { role: 'user', content: message }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || null;
}

async function sendToCohere(credential: string, message: string, model: string, isOAuth: boolean): Promise<string | null> {
  const headers: any = {
    'Content-Type': 'application/json'
  };

  if (isOAuth) {
    headers['Authorization'] = `Bearer ${credential}`;
  } else {
    headers['Authorization'] = `Bearer ${credential}`;
  }

  const response = await fetch('https://api.cohere.ai/v1/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'command-r-plus',
      message,
      stream: false
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${error}`);
  }

  const data = await response.json();
  return data.text || null;
}

function calculateCost(provider: string, tokens: number): number {
  const costPerThousand = {
    openai: 0.03,      // GPT-4 pricing
    anthropic: 0.015,  // Claude pricing
    google: 0.001,     // Gemini pricing
    microsoft: 0.03,   // Azure OpenAI pricing
    perplexity: 0.002, // Perplexity pricing
    cohere: 0.001,     // Cohere pricing
    default: 0.002
  };

  const rate = costPerThousand[provider as keyof typeof costPerThousand] || costPerThousand.default;
  return (tokens / 1000) * rate;
}

function decryptData(encrypted: string | undefined): string | null {
  if (!encrypted) return null;

  try {
    const { data, iv } = JSON.parse(encrypted);
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(os.hostname(), 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}