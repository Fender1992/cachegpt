import inquirer from 'inquirer';
import chalk from 'chalk';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
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
 * Fixed Claude Web Authentication - bypasses Google's automation detection
 * Uses a persistent browser context with real user data
 */
export async function initClaudeFixed(): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan.bold('\n🤖 Claude Web Authentication\n'));
  console.log(chalk.white('This works exactly like Claude Code!'));
  console.log(chalk.gray('We\'ll use your existing Chrome profile to avoid detection.\n'));

  const credentialStore = new CredentialStore();
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Option 1: Use existing Chrome user data (bypasses Google detection)
    const { useExistingProfile } = await inquirer.prompt([{
      type: 'confirm',
      name: 'useExistingProfile',
      message: 'Use your existing Chrome profile? (Recommended to avoid Google blocking)',
      default: true
    }]);

    const spinner = ora('Preparing browser...').start();

    if (useExistingProfile) {
      // Find Chrome user data directory
      const userDataDir = findChromeUserDataDir();

      if (!userDataDir) {
        spinner.fail('Chrome profile not found');
        console.log(chalk.yellow('Falling back to isolated browser...\n'));
      } else {
        spinner.text = 'Using your Chrome profile...';

        // Launch with existing user data - this bypasses Google's detection
        context = await chromium.launchPersistentContext(userDataDir, {
          headless: false,
          channel: 'chrome',
          viewport: null,
          // Important: Don't set any automation-related flags
          args: [
            '--disable-blink-features=AutomationControlled',
          ]
        });

        page = context.pages()[0] || await context.newPage();
      }
    }

    // Option 2: Launch with stealth mode flags
    if (!page) {
      spinner.text = 'Launching stealth browser...';

      browser = await chromium.launch({
        headless: false,
        channel: 'chrome', // Use real Chrome
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--flag-switches-begin',
          '--disable-site-isolation-trials',
          '--flag-switches-end',
          // Use a real user agent
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
      });

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      // Remove automation indicators
      await context.addInitScript(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        (window.navigator.permissions as any).query = (parameters: any) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission } as any) :
            originalQuery(parameters)
        );

        // Add chrome object
        if (!(window as any).chrome) {
          (window as any).chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
          };
        }

        // Fix navigator.plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });

        // Fix navigator.languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
      });

      page = await context.newPage();
    }

    spinner.text = 'Opening Claude.ai...';

    // Navigate to Claude
    await page.goto('https://claude.ai/login', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    spinner.stop();

    console.log(chalk.cyan('\n📝 Please log in to Claude:'));
    console.log(chalk.white('\nTips to avoid "browser not secure" error:'));
    console.log(chalk.gray('  1. If using Google login and it\'s blocked:'));
    console.log(chalk.gray('     • Try using email/password login instead'));
    console.log(chalk.gray('     • Or use "Sign in with Google" from a different browser first,'));
    console.log(chalk.gray('       then use email login here'));
    console.log(chalk.gray('  2. The window will stay open - take your time'));
    console.log(chalk.gray('  3. Once logged in, we\'ll automatically detect it\n'));

    // Wait for successful login
    let sessionCookie: string | null = null;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes timeout

    while (!sessionCookie && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      try {
        // Check if logged in
        const isLoggedIn = await page.evaluate(() => {
          return !!(
            window.location.pathname.includes('/chat') ||
            window.location.pathname === '/' ||
            document.querySelector('[data-testid="composer"]') ||
            document.querySelector('textarea[placeholder*="Talk to Claude"]')
          );
        });

        if (isLoggedIn) {
          const cookies = await context!.cookies();
          const sessionCookieObj = cookies.find(c =>
            c.name.toLowerCase().includes('session') ||
            c.name === 'sessionKey' ||
            c.name === '__Secure-next-auth.session-token'
          );

          if (sessionCookieObj) {
            sessionCookie = sessionCookieObj.value;
            console.log(chalk.green('\n✅ Login successful! Session captured.\n'));
            break;
          }
        }

        if (attempts % 10 === 0) {
          process.stdout.write('.');
        }

      } catch (error) {
        // Page might be navigating
      }
    }

    if (!sessionCookie) {
      // Manual fallback
      console.log(chalk.yellow('\n⚠️  Automatic capture failed. Let\'s do it manually:\n'));

      const { manualCookie } = await inquirer.prompt([{
        type: 'password',
        name: 'manualCookie',
        message: 'Open DevTools (F12) → Application → Cookies → Find session cookie → Paste here:',
        mask: '*',
        validate: (input) => input.length > 20 || 'Session cookie should be a long string'
      }]);

      sessionCookie = manualCookie;
    }

    if (!sessionCookie) {
      throw new Error('No session cookie captured');
    }

    // Clean up
    if (browser) await browser.close();
    if (context && !useExistingProfile) await context.close();

    // Save the session
    const userId = crypto.randomBytes(16).toString('hex');

    await credentialStore.store(`anthropic:claude-web:${userId}`, {
      accessToken: sessionCookie!,
      provider: 'anthropic',
      userId,
      userEmail: 'claude.ai-user',
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    });

    const config: ClaudeWebConfig = {
      mode: 'browser',
      provider: 'anthropic',
      authMethod: 'web-session',
      sessionKey: encryptData(sessionCookie!),
      defaultModel: 'claude-3-opus-20240229',
      cacheEnabled: true,
      cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
      userId,
      userEmail: 'claude.ai-user'
    };

    return config;

  } catch (error: any) {
    if (browser) await browser.close();
    if (context) await context.close();

    console.log(chalk.red('\n❌ Authentication failed'));
    console.log(chalk.yellow('Error: ' + error.message));

    // Fall back to manual method
    const { initClaudeWebAuth } = await import('./init-claude-web');
    return initClaudeWebAuth();
  }
}

/**
 * Find Chrome user data directory based on OS
 */
function findChromeUserDataDir(): string | null {
  const platform = process.platform;
  let userDataDir: string | null = null;

  if (platform === 'win32') {
    // Windows
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    userDataDir = path.join(localAppData, 'Google', 'Chrome', 'User Data');
  } else if (platform === 'darwin') {
    // macOS
    userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  } else {
    // Linux
    userDataDir = path.join(os.homedir(), '.config', 'google-chrome');
  }

  // Check if directory exists
  if (userDataDir && fs.existsSync(userDataDir)) {
    return userDataDir;
  }

  return null;
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