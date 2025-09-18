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
 * Fully automated Claude Web Authentication - exactly like Claude Code!
 * This captures the session cookie automatically after login.
 */
export async function initClaudeAutomated(): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan.bold('\n🤖 Claude Web Authentication (Automated)\n'));
  console.log(chalk.white('This works exactly like Claude Code!'));
  console.log(chalk.gray('A browser window will open for you to log in to Claude.\n'));

  const credentialStore = new CredentialStore();
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Launch browser with a persistent context to maintain session
    const spinner = ora('Launching browser...').start();

    // Create a temporary user data directory for the browser session
    const userDataDir = path.join(os.tmpdir(), `claude-session-${Date.now()}`);

    // Launch browser with UI (not headless) so user can log in
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome', // Use Chrome if available, otherwise Chromium
    });

    // Create a persistent context
    context = await browser.newContext({
      // Set a realistic user agent
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      // Accept all cookies
      acceptDownloads: false,
    });

    // Create a new page
    page = await context.newPage();

    spinner.text = 'Opening Claude.ai...';

    // Navigate to Claude
    await page.goto('https://claude.ai/login', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    spinner.stop();
    console.log(chalk.cyan('\n📝 Please log in to Claude using your preferred method:'));
    console.log(chalk.gray('  • Google'));
    console.log(chalk.gray('  • Email'));
    console.log(chalk.gray('  • Or any other method you normally use\n'));
    console.log(chalk.yellow('⏳ Waiting for you to complete login...\n'));

    // Wait for successful login by checking for session cookie or specific elements
    let sessionCookie: string | null = null;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes timeout

    while (!sessionCookie && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
      attempts++;

      try {
        // Check if we're on the main Claude interface (logged in)
        const isLoggedIn = await page.evaluate(() => {
          // Check for various indicators that we're logged in
          return !!(
            window.location.pathname.includes('/chat') ||
            window.location.pathname === '/' ||
            document.querySelector('[data-testid="composer"]') ||
            document.querySelector('textarea[placeholder*="Talk to Claude"]') ||
            document.querySelector('button[aria-label*="New chat"]')
          );
        });

        if (isLoggedIn) {
          // Get all cookies
          const cookies = await context.cookies();

          // Find the session cookie (might be named differently)
          const sessionCookieObj = cookies.find(c =>
            c.name.toLowerCase().includes('session') ||
            c.name === 'sessionKey' ||
            c.name === '__Secure-next-auth.session-token' ||
            c.name.includes('auth')
          );

          if (sessionCookieObj) {
            sessionCookie = sessionCookieObj.value;
            console.log(chalk.green('\n✅ Login successful! Session captured.\n'));
            break;
          }

          // Alternative: try to get from localStorage or other storage
          const storageData = await page.evaluate(() => {
            const data: any = {};
            // Check localStorage
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key) {
                data[key] = localStorage.getItem(key);
              }
            }
            return data;
          });

          // Look for session data in localStorage
          const sessionKey = Object.entries(storageData).find(([key, value]) =>
            key.includes('session') || key.includes('auth')
          );

          if (sessionKey) {
            sessionCookie = sessionKey[1] as string;
            console.log(chalk.green('\n✅ Login successful! Session captured from storage.\n'));
            break;
          }
        }

        // Show progress indicator
        if (attempts % 5 === 0) {
          process.stdout.write('.');
        }

      } catch (error) {
        // Page might be navigating, continue checking
      }
    }

    if (!sessionCookie) {
      console.log(chalk.red('\n❌ Login timeout. No session cookie found.'));
      console.log(chalk.yellow('The browser will remain open. Please complete login and try again.\n'));

      // Keep browser open and wait for user confirmation
      const { completed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'completed',
        message: 'Have you completed the login?',
        default: false
      }]);

      if (completed) {
        // Try one more time to get the cookie
        const cookies = await context.cookies();
        const sessionCookieObj = cookies.find(c =>
          c.name.toLowerCase().includes('session') ||
          c.name === 'sessionKey'
        );

        if (sessionCookieObj) {
          sessionCookie = sessionCookieObj.value;
        }
      }

      if (!sessionCookie) {
        throw new Error('Failed to capture session cookie');
      }
    }

    // Get organization ID if present (for Claude for Work)
    let organizationId: string | undefined;
    try {
      const url = page.url();
      const urlMatch = url.match(/\/org\/([^\/]+)/);
      if (urlMatch) {
        organizationId = urlMatch[1];
        console.log(chalk.gray(`Organization detected: ${organizationId}\n`));
      }
    } catch {
      // No org ID, that's fine
    }

    // Get user email if available
    let userEmail: string | undefined;
    try {
      userEmail = await page.evaluate(() => {
        // Try to find user email in the page
        const emailElement = document.querySelector('[data-testid="user-email"]');
        return emailElement?.textContent || undefined;
      });
    } catch {
      // No email found, that's fine
    }

    // Close the browser
    await browser.close();

    // Test the session
    console.log(chalk.yellow('🔍 Validating session...\n'));
    const testSuccess = await testClaudeSession(sessionCookie, organizationId);

    if (!testSuccess) {
      console.log(chalk.red('⚠️  Session validation failed, but we\'ll try to use it anyway.\n'));
    } else {
      console.log(chalk.green('✅ Session validated successfully!\n'));
    }

    // Save the session securely
    const userId = crypto.randomBytes(16).toString('hex');

    // Store in credential store (encrypted)
    await credentialStore.store(`anthropic:claude-web:${userId}`, {
      accessToken: sessionCookie,
      provider: 'anthropic',
      userId,
      userEmail: userEmail || 'claude.ai-user',
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    });

    // Return configuration
    const config: ClaudeWebConfig = {
      mode: 'browser',
      provider: 'anthropic',
      authMethod: 'web-session',
      sessionKey: encryptData(sessionCookie),
      organizationId: organizationId ? encryptData(organizationId) : undefined,
      defaultModel: 'claude-3-opus-20240229',
      cacheEnabled: true,
      cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
      userId,
      userEmail: userEmail || 'claude.ai-user'
    };

    // Clean up temp directory
    try {
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }

    return config;

  } catch (error: any) {
    // Clean up on error
    if (browser) {
      await browser.close().catch(() => {});
    }

    console.log(chalk.red('\n❌ Automated authentication failed'));
    console.log(chalk.yellow('Error: ' + error.message));
    console.log(chalk.yellow('\nFalling back to manual method...\n'));

    // Fall back to manual method
    const { initClaudeWebAuth } = await import('./init-claude-web');
    return initClaudeWebAuth();
  }
}

/**
 * Test if the Claude session is valid
 */
async function testClaudeSession(sessionCookie: string, organizationId?: string): Promise<boolean> {
  try {
    const headers: any = {
      'Cookie': `sessionKey=${sessionCookie}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    };

    if (organizationId) {
      headers['anthropic-organization-id'] = organizationId;
    }

    // Try a simple API call to check if session is valid
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers
    });

    return response.ok;
  } catch (error) {
    return false;
  }
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