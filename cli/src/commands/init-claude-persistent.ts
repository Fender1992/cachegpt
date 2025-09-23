import inquirer from 'inquirer';
import chalk from 'chalk';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { saveConfig, getConfigPath } from '../lib/config';
import { CredentialStore } from '../lib/credential-store';
import ora from 'ora';

interface ClaudeWebConfig {
  mode: 'browser';
  provider: 'anthropic';
  authMethod: 'web-session';
  sessionKey?: string;
  organizationId?: string;
  defaultModel: string;
  cacheEnabled: boolean;
  cacheLocation: string;
  userId?: string;
  userEmail?: string;
}

/**
 * The ACTUAL solution - Use a persistent browser context like Claude Code does!
 * This maintains cookies between sessions and isn't detected as automation.
 */
export async function initClaudePersistent(): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan.bold('\n🤖 Claude Web Authentication (Like Claude Code!)\n'));
  console.log(chalk.white('This uses a persistent browser profile that maintains your login.'));
  console.log(chalk.gray('Just like Claude Code, you only need to login once!\n'));

  const credentialStore = new CredentialStore();

  try {
    // Use a persistent user data directory (just like Claude Code!)
    const userDataDir = path.join(os.homedir(), '.cachegpt', 'browser-profile');

    // Create directory if it doesn't exist
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
      console.log(chalk.yellow('📁 Creating persistent browser profile...\n'));
    } else {
      console.log(chalk.green('✅ Found existing browser profile\n'));
    }

    const spinner = ora('Launching browser...').start();

    // Launch with persistent context - this is the KEY!
    // This creates a real browser profile that persists cookies
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome', // Use Chrome if available
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Disable automation flags
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-automation',
        '--no-sandbox'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    // Get the first page or create a new one
    let page = context.pages()[0];
    if (!page) {
      page = await context.newPage();
    }

    spinner.text = 'Navigating to Claude...';

    // Navigate to Claude
    await page.goto('https://claude.ai', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    spinner.stop();

    // Check if already logged in (cookies persisted from previous session)
    const isAlreadyLoggedIn = await checkIfLoggedIn(page);

    if (isAlreadyLoggedIn) {
      console.log(chalk.green('✅ Already logged in! (session persisted)\n'));
    } else {
      console.log(chalk.cyan('📝 Please log in to Claude:\n'));
      console.log(chalk.white('Tips:'));
      console.log(chalk.gray('• Use any login method (Google, email, Apple, etc.)'));
      console.log(chalk.gray('• The browser will remember your login for next time'));
      console.log(chalk.gray('• This works exactly like Claude Code!\n'));

      // Wait for login
      await waitForLogin(page);
    }

    // Extract session cookie - try multiple approaches
    const cookies = await context.cookies();

    // Log all cookies for debugging
    console.log(chalk.gray(`Found ${cookies.length} cookies`));

    // Look for various possible session cookies
    let sessionCookie = cookies.find(c =>
      c.name.toLowerCase().includes('session') ||
      c.name === 'sessionKey' ||
      c.name.includes('auth') ||
      c.name.includes('token') ||
      c.name.includes('sid') ||
      c.domain.includes('claude.ai')
    );

    // If no specific session cookie, try to find the most likely one
    if (!sessionCookie && cookies.length > 0) {
      // Sort by value length (session cookies tend to be long)
      const sortedCookies = cookies.sort((a, b) => b.value.length - a.value.length);
      // Pick the longest cookie from claude.ai domain
      sessionCookie = sortedCookies.find(c => c.domain.includes('claude.ai'));

      if (sessionCookie) {
        console.log(chalk.yellow(`Using longest cookie: ${sessionCookie.name}`));
      }
    }

    if (!sessionCookie) {
      console.log(chalk.red('Available cookies:'));
      cookies.forEach(c => {
        console.log(chalk.gray(`  - ${c.name} (${c.domain}): ${c.value.substring(0, 20)}...`));
      });
      throw new Error('Could not find session cookie');
    }

    console.log(chalk.green('✅ Session captured successfully!\n'));

    // Close browser but keep the profile
    await context.close();

    // Save configuration
    const userId = crypto.randomBytes(16).toString('hex');

    await credentialStore.store(`anthropic:claude-web:${userId}`, {
      accessToken: sessionCookie.value,
      provider: 'anthropic',
      userId,
      userEmail: 'claude.ai-user',
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    });

    const config: ClaudeWebConfig = {
      mode: 'browser',
      provider: 'anthropic',
      authMethod: 'web-session',
      sessionKey: encryptData(sessionCookie.value),
      defaultModel: 'claude-3-opus-20240229',
      cacheEnabled: true,
      cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
      userId,
      userEmail: 'claude.ai-user'
    };

    console.log(chalk.cyan('💡 Pro tip: Your login is saved in the browser profile.'));
    console.log(chalk.cyan('   Next time, it will log in automatically!\n'));

    return config;

  } catch (error: any) {
    console.log(chalk.red('\n❌ Authentication failed'));
    console.log(chalk.yellow('Error: ' + error.message));

    // Check if it's a Cloudflare issue
    if (error.message.includes('Cloudflare') || error.message.includes('verification')) {
      console.log(chalk.yellow('\n📌 Cloudflare detected. Try these solutions:'));
      console.log('1. Wait a few minutes and try again');
      console.log('2. Use a VPN to change your IP');
      console.log('3. Use the manual method (copy cookie from your regular browser)\n');
    }

    // Fall back to manual token entry
    console.log(chalk.yellow('Automatic browser login failed. Please enter token manually.'));

    const { sessionKey } = await inquirer.prompt({
      type: 'password',
      name: 'sessionKey',
      message: 'Enter your Claude session token:',
      mask: '*'
    });

    return {
      mode: 'browser',
      provider: 'anthropic',
      authMethod: 'web-session',
      sessionKey: sessionKey,
      defaultModel: 'claude-3-opus',
      cacheEnabled: true,
      cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache')
    };
  }
}

async function checkIfLoggedIn(page: any): Promise<boolean> {
  try {
    // First check URL - most reliable indicator
    const url = page.url();
    if (url.includes('/chat') || url.includes('/new')) {
      return true;
    }

    // Check multiple indicators of being logged in
    const isLoggedIn = await page.evaluate(() => {
      // Check for various Claude UI elements that indicate logged in state
      const selectors = [
        // Text input areas
        'textarea',
        'div[contenteditable="true"]',
        '[data-testid="composer"]',
        '[placeholder*="Message"]',
        '[placeholder*="Talk"]',
        '[placeholder*="Ask"]',
        '[placeholder*="Type"]',
        // Buttons that appear when logged in
        'button[aria-label*="New"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Clear"]',
        'button:has-text("New chat")',
        // Navigation elements
        'nav a[href*="/chat"]',
        'nav a[href*="/new"]',
        // Main content areas
        'main div[class*="composer"]',
        'main div[class*="input"]',
        'main form'
      ];

      // Check if any selector exists
      for (const selector of selectors) {
        try {
          if (document.querySelector(selector)) {
            return true;
          }
        } catch {}
      }

      // Check for text content that indicates logged in
      const bodyText = document.body?.innerText || '';
      if (bodyText.includes('New chat') ||
          bodyText.includes('Clear chat') ||
          bodyText.includes('Previous chats') ||
          bodyText.includes('Chat history')) {
        return true;
      }

      return false;
    });

    return isLoggedIn;
  } catch (err: any) {
    console.log(chalk.gray(`Login check error: ${err?.message || 'Unknown error'}`));
    return false;
  }
}

async function waitForLogin(page: any): Promise<void> {
  console.log(chalk.yellow('⏳ Waiting for login...'));
  console.log(chalk.gray('(Looking for chat interface after login)\n'));

  let attempts = 0;
  const maxAttempts = 300; // 5 minutes
  let lastUrl = '';

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;

    // Check if URL changed (indicates navigation)
    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      console.log(chalk.gray(`📍 Navigated to: ${currentUrl}`));
      lastUrl = currentUrl;
    }

    const isLoggedIn = await checkIfLoggedIn(page);
    if (isLoggedIn) {
      console.log(chalk.green('\n✅ Login successful!\n'));
      // Wait a bit for cookies to be set
      await new Promise(resolve => setTimeout(resolve, 3000));
      return;
    }

    if (attempts % 10 === 0) {
      // Every 10 seconds, show status
      console.log(chalk.gray(`⏱️  Still waiting... (${Math.floor(attempts / 60)}:${String(attempts % 60).padStart(2, '0')})`));

      // Debug: Check what's on the page
      try {
        const pageInfo = await page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            hasTextarea: !!document.querySelector('textarea'),
            hasForm: !!document.querySelector('form'),
            bodyLength: document.body?.innerText?.length || 0
          };
        });
        console.log(chalk.gray(`   Page: ${pageInfo.title || 'Untitled'}, Content size: ${pageInfo.bodyLength} chars`));
      } catch {}
    }

    // Check for Cloudflare challenge
    try {
      const hasCloudflare = await page.evaluate(() => {
        return !!(
          document.querySelector('.cf-turnstile') ||
          document.querySelector('[id*="challenge"]') ||
          document.title?.toLowerCase().includes('just a moment') ||
          document.body?.textContent?.includes('Checking if the site connection is secure') ||
          document.body?.textContent?.includes('Verify you are human')
        );
      });

      if (hasCloudflare) {
        console.log(chalk.yellow('\n⚠️  Cloudflare verification detected.'));
        console.log(chalk.gray('Please complete the verification in the browser...\n'));
        // Give more time for Cloudflare
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch {
      // Ignore errors during check
    }
  }

  throw new Error('Login timeout - please try again');
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