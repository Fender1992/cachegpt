import inquirer from 'inquirer';
import chalk from 'chalk';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { saveConfig, getConfigPath } from '../lib/config';
import { CredentialStore } from '../lib/credential-store';
import ora from 'ora';
import open from 'open';

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
 * Ultimate solution: Use the REAL Chrome browser with remote debugging
 * This completely bypasses Cloudflare and Google detection
 */
export async function initClaudeRealBrowser(): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan.bold('\n🌐 Claude Web Authentication (Real Browser)\n'));
  console.log(chalk.white('This method uses your actual Chrome browser to bypass all detection!'));
  console.log(chalk.gray('We\'ll open Chrome with remote debugging to capture your session.\n'));

  const credentialStore = new CredentialStore();

  try {
    // Method 1: Connect to existing Chrome with remote debugging
    const { method } = await inquirer.prompt([{
      type: 'list',
      name: 'method',
      message: 'Choose authentication method:',
      choices: [
        {
          name: '🚀 Quick: Open Claude in your browser (simplest)',
          value: 'quick'
        },
        {
          name: '🔧 Advanced: Use Chrome remote debugging (most reliable)',
          value: 'debug'
        },
        {
          name: '📋 Manual: Copy session from existing browser',
          value: 'manual'
        }
      ]
    }]);

    if (method === 'quick') {
      return await quickBrowserMethod(credentialStore);
    } else if (method === 'debug') {
      return await remoteDebugMethod(credentialStore);
    } else {
      return await manualMethod(credentialStore);
    }

  } catch (error: any) {
    console.log(chalk.red('\n❌ Authentication failed'));
    console.log(chalk.yellow('Error: ' + error.message));

    // Fall back to manual method
    return await manualMethod(credentialStore);
  }
}

/**
 * Method 1: Quick - Just open browser and guide user
 */
async function quickBrowserMethod(credentialStore: CredentialStore): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan('\n🚀 Quick Browser Method\n'));
  console.log(chalk.yellow('Steps:'));
  console.log('1. Your browser will open to claude.ai');
  console.log('2. Log in if needed (Google, email, etc.)');
  console.log('3. Once logged in, we\'ll help you get the session\n');

  // Open Claude in default browser
  await open('https://claude.ai');

  console.log(chalk.green('Browser opened! Please log in if needed.\n'));

  // Wait for user to confirm login
  const { loggedIn } = await inquirer.prompt([{
    type: 'confirm',
    name: 'loggedIn',
    message: 'Are you logged in to Claude?',
    default: false
  }]);

  if (!loggedIn) {
    console.log(chalk.yellow('\nPlease log in and try again.'));
    return quickBrowserMethod(credentialStore);
  }

  // Guide user to get session cookie
  console.log(chalk.cyan('\n📋 Getting your session cookie:\n'));
  console.log(chalk.white('In the Claude tab:'));
  console.log('1. Press F12 to open Developer Tools');
  console.log('2. Go to the "Application" tab (or "Storage" in Firefox)');
  console.log('3. On the left sidebar, expand "Cookies"');
  console.log('4. Click on "https://claude.ai"');
  console.log('5. Look for a cookie that contains "session" in its name');
  console.log('   (like "sessionKey", "__Secure-next-auth.session-token", etc.)');
  console.log('6. Click on it and copy the "Value" field (it\'s a long string)\n');

  const { sessionCookie } = await inquirer.prompt([{
    type: 'password',
    name: 'sessionCookie',
    message: 'Paste the session cookie value here:',
    mask: '*',
    validate: (input) => input.length > 20 || 'Session cookie should be a long string'
  }]);

  return saveSession(sessionCookie, credentialStore);
}

/**
 * Method 2: Remote debugging - Connect to Chrome with debugging port
 */
async function remoteDebugMethod(credentialStore: CredentialStore): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan('\n🔧 Chrome Remote Debugging Method\n'));
  console.log(chalk.yellow('This method launches Chrome with remote debugging enabled.\n'));

  const debugPort = 9222;
  const chromeExecutable = findChromeExecutable();

  if (!chromeExecutable) {
    console.log(chalk.red('❌ Chrome not found on your system'));
    console.log(chalk.yellow('Falling back to manual method...\n'));
    return manualMethod(credentialStore);
  }

  // Kill any existing Chrome debug instances
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "chrome.*remote-debugging-port" 2>/dev/null', { stdio: 'ignore' });
    }
  } catch {
    // Ignore errors
  }

  console.log(chalk.gray('Launching Chrome with remote debugging...'));

  // Launch Chrome with remote debugging
  const chromeProcess = spawn(chromeExecutable, [
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${path.join(os.tmpdir(), 'cachegpt-chrome-' + Date.now())}`,
    'https://claude.ai'
  ], {
    detached: true,
    stdio: 'ignore'
  });

  // Wait for Chrome to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Connect with Playwright
    const browser = await chromium.connectOverCDP(`http://localhost:${debugPort}`);
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const pages = context.pages();
    const page = pages.find(p => p.url().includes('claude.ai')) || pages[0];

    if (!page) {
      throw new Error('Could not connect to Chrome');
    }

    console.log(chalk.green('✅ Connected to Chrome!\n'));
    console.log(chalk.cyan('Please log in to Claude in the opened browser window.'));
    console.log(chalk.gray('(Use Google, email, or any login method)\n'));

    // Wait for login
    let sessionCookie: string | null = null;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes

    while (!sessionCookie && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      try {
        // Check if logged in by looking for chat interface
        const isLoggedIn = await page.evaluate(() => {
          return !!(
            document.querySelector('[data-testid="composer"]') ||
            document.querySelector('textarea[placeholder*="Talk to Claude"]') ||
            document.querySelector('button[aria-label*="New chat"]') ||
            (window.location.pathname.includes('/chat') && document.querySelector('main'))
          );
        });

        if (isLoggedIn) {
          // Get cookies
          const cookies = await context.cookies();
          const sessionCookieObj = cookies.find(c =>
            c.name.toLowerCase().includes('session') ||
            c.name === 'sessionKey' ||
            c.name.includes('auth')
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
      } catch {
        // Page might be navigating
      }
    }

    // Close the browser
    await browser.close();
    chromeProcess.kill();

    if (!sessionCookie) {
      throw new Error('Could not capture session');
    }

    return saveSession(sessionCookie, credentialStore);

  } catch (error: any) {
    // Kill Chrome process
    chromeProcess.kill();
    throw error;
  }
}

/**
 * Method 3: Manual - Just guide the user
 */
async function manualMethod(credentialStore: CredentialStore): Promise<ClaudeWebConfig> {
  console.log(chalk.cyan('\n📋 Manual Session Capture\n'));
  console.log(chalk.white('Please follow these steps:\n'));
  console.log('1. Open Chrome normally (not incognito)');
  console.log('2. Go to https://claude.ai');
  console.log('3. Log in with your account (Google, email, etc.)');
  console.log('4. Once logged in, press F12 to open Developer Tools');
  console.log('5. Go to Application → Cookies → https://claude.ai');
  console.log('6. Find a cookie with "session" in the name');
  console.log('7. Copy its "Value" field\n');

  const { openBrowser } = await inquirer.prompt([{
    type: 'confirm',
    name: 'openBrowser',
    message: 'Should I open Claude in your browser?',
    default: true
  }]);

  if (openBrowser) {
    await open('https://claude.ai');
  }

  const { sessionCookie } = await inquirer.prompt([{
    type: 'password',
    name: 'sessionCookie',
    message: 'Paste the session cookie value here:',
    mask: '*',
    validate: (input) => input.length > 20 || 'Session cookie should be a long string'
  }]);

  return saveSession(sessionCookie, credentialStore);
}

/**
 * Save the session and return config
 */
async function saveSession(sessionCookie: string, credentialStore: CredentialStore): Promise<ClaudeWebConfig> {
  console.log(chalk.yellow('\n🔍 Validating session...\n'));

  // Test the session
  const testSuccess = await testClaudeSession(sessionCookie);

  if (!testSuccess) {
    console.log(chalk.yellow('⚠️  Session validation failed, but we\'ll try to use it anyway.\n'));
  } else {
    console.log(chalk.green('✅ Session validated successfully!\n'));
  }

  // Save the session
  const userId = crypto.randomBytes(16).toString('hex');

  await credentialStore.store(`anthropic:claude-web:${userId}`, {
    accessToken: sessionCookie,
    provider: 'anthropic',
    userId,
    userEmail: 'claude.ai-user',
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
  });

  const config: ClaudeWebConfig = {
    mode: 'browser',
    provider: 'anthropic',
    authMethod: 'web-session',
    sessionKey: encryptData(sessionCookie),
    defaultModel: 'claude-3-opus-20240229',
    cacheEnabled: true,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache'),
    userId,
    userEmail: 'claude.ai-user'
  };

  return config;
}

/**
 * Test if the Claude session is valid
 */
async function testClaudeSession(sessionCookie: string): Promise<boolean> {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers: {
        'Cookie': `sessionKey=${sessionCookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Find Chrome executable based on OS
 */
function findChromeExecutable(): string | null {
  const platform = process.platform;

  const possiblePaths = platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ] : platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const path of possiblePaths) {
    if (path && fs.existsSync(path)) {
      return path;
    }
  }

  // Try to find it in PATH
  try {
    const result = execSync('which google-chrome || which chrome || which chromium', { encoding: 'utf8' }).trim();
    if (result) return result.split('\n')[0];
  } catch {
    // Not found
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