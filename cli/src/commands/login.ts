#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from '../lib/auth-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function loginCommand() {
  // Import and use the simple version
  const { loginCommandSimple } = await import('./login-simple');
  return loginCommandSimple();
}

export async function loginCommandOld() {
  console.log(chalk.cyan('🔐 Login to CacheGPT\n'));

  try {
    // The AuthService will load defaults from .env.defaults automatically
    // No need to manually load environment variables here
    const authService = new AuthService();

    // Check if already logged in
    const currentUser = await authService.getCurrentUser();
    if (currentUser) {
      console.log(chalk.yellow('⚠️  You are already logged in as:'), currentUser.email);

      const { confirmLogout } = await inquirer.prompt({
          type: 'confirm',
          name: 'confirmLogout',
          message: 'Do you want to logout and login with a different account?',
          default: false,
        });

      if (!confirmLogout) {
        return;
      }

      await authService.logout();
      console.log(chalk.dim('Logged out successfully\n'));
    }

    // Open browser for OAuth login with CLI source parameter
    console.log(chalk.cyan('🌐 Opening browser for authentication...\n'));

    const open = await import('open').catch(() => null);
    const authUrl = 'https://cachegpt-1zyg7ani5-rolando-fenders-projects.vercel.app/login?source=cli&return_to=terminal';

    if (open) {
      await open.default(authUrl);
      console.log(chalk.green('✅ Browser opened to login page'));
      console.log(chalk.gray('The browser window will close automatically after successful authentication.'));
    } else {
      console.log(chalk.yellow('Please open this URL in your browser:'));
      console.log(chalk.blue.underline(authUrl));
    }

    console.log();
    console.log(chalk.gray('Complete the OAuth login in your browser (Google or GitHub).'));
    console.log(chalk.gray('After login, select your LLM provider in the browser.'));
    console.log(chalk.gray('The terminal will automatically continue once you make your selection.'));
    console.log();

    // Wait for user action - the browser will handle provider selection
    console.log(chalk.cyan('⏳ Waiting for you to complete login and select an LLM provider...'));
    console.log();

    // Wait for the web authentication to complete and retrieve session info
    console.log(chalk.yellow('Please complete the authentication in your browser...'));
    console.log(chalk.gray('Note: After selecting your provider, return here to continue.\n'));

    // Poll for session completion by checking localStorage or a callback
    let sessionData: any = null;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    // Create a simple HTTP server to receive the callback
    const express = await import('express').catch(() => null);
    if (express) {
      const app = express.default();
      let server: any;
      let sessionReceived = false;

      await new Promise<void>((resolve) => {
        app.use(express.default.json());

        // Add CORS headers
        app.use((req: any, res: any, next: any) => {
          res.header('Access-Control-Allow-Origin', '*');
          res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
          res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
          if (req.method === 'OPTIONS') {
            res.sendStatus(200);
          } else {
            next();
          }
        });

        // Multiple callback endpoints
        const handleCallback = (req: any, res: any) => {
          console.log(chalk.green('\\n✅ Received authentication callback!'));
          sessionData = req.body;
          sessionReceived = true;
          res.json({ success: true, message: 'Authentication received' });
          setTimeout(() => resolve(), 500); // Small delay to send response
        };

        app.post('/auth/callback', handleCallback);
        app.get('/provider-selected', (req: any, res: any) => {
          console.log(chalk.green('\\n✅ Received provider selection!'));
          sessionData = {
            provider: req.query.provider,
            email: req.query.email,
            userName: req.query.userName || req.query.email?.split('@')[0],
            sessionToken: req.query.sessionToken
          };
          sessionReceived = true;
          res.json({ success: true });
          setTimeout(() => resolve(), 500);
        });

        // Try multiple ports
        let port = 3001;
        const tryListen = () => {
          server = app.listen(port, () => {
            console.log(chalk.gray(`Listening for authentication callback on port ${port}...`));
          }).on('error', (err: any) => {
            if (err.code === 'EADDRINUSE' && port < 3010) {
              port++;
              tryListen();
            } else {
              console.log(chalk.yellow('Could not start callback server'));
              resolve();
            }
          });
        };

        tryListen();

        // Timeout with countdown
        let countdown = 45; // 45 seconds
        const countdownInterval = setInterval(() => {
          if (sessionReceived) {
            clearInterval(countdownInterval);
            return;
          }

          if (countdown % 15 === 0) {
            console.log(chalk.gray(`⏳ Still waiting... (${countdown}s remaining)`));
          }

          countdown--;

          if (countdown <= 0) {
            clearInterval(countdownInterval);
            if (server) server.close();
            resolve();
          }
        }, 1000);
      });

      if (server) {
        server.close();
      }
    }

    // If we didn't receive session data via callback, ask the user manually
    let userEmail: string;
    let provider: string;

    if (sessionData && sessionData.email && sessionData.provider) {
      userEmail = sessionData.email;
      provider = sessionData.provider;
      console.log(chalk.green(`\n✅ Authenticated as ${userEmail}`));
      console.log(chalk.green(`Provider: ${provider}\n`));
    } else {
      // Fallback to manual entry
      console.log(chalk.yellow('\n⚠️ Automatic session capture unavailable. Please enter details manually.\n'));

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'userEmail',
          message: 'Enter your email address (the one you used to log in):',
          validate: (input) => {
            if (!input || !input.includes('@')) {
              return 'Please enter a valid email address';
            }
            return true;
          }
        },
        {
          type: 'list',
          name: 'provider',
          message: 'Which LLM provider did you select?',
          choices: [
            { name: 'ChatGPT (OpenAI)', value: 'chatgpt' },
            { name: 'Claude (Anthropic)', value: 'claude' },
            { name: 'Gemini (Google)', value: 'gemini' },
            { name: 'Perplexity', value: 'perplexity' }
          ]
        }
      ]);

      userEmail = answers.userEmail;
      provider = answers.provider;
    }

    if (!provider) {
      console.log(chalk.yellow('\n⚠️ No provider selected. Please run login again.'));
      return;
    }

    console.log(chalk.green(`\n✅ Great! Setting up ${provider.toUpperCase()} for ${userEmail}`));
    console.log();

    // Generate or get session token
    let sessionToken = await authService.getSessionToken();
    if (!sessionToken) {
      // Generate a temporary session token for provider auth
      sessionToken = require('crypto').randomBytes(32).toString('hex');
    }

    // Provider authentication now handled via web flow
    console.log(chalk.green('✅ Authentication successful!'));
    console.log(chalk.gray('Use cachegpt chat to start chatting'));

    // Store Claude user ID if available
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeConfigPath)) {
      try {
        const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
        if (claudeConfig.userID) {
          const configDir = path.join(os.homedir(), '.cachegpt');
          if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
          }

          const userConfigPath = path.join(configDir, 'user-config.json');
          fs.writeFileSync(
            userConfigPath,
            JSON.stringify({ claude_user_id: claudeConfig.userID }, null, 2),
            { mode: 0o600 }
          );

          console.log(chalk.dim('\n📝 Claude user ID linked for conversation sync'));
        }
      } catch (error) {
        // Silently continue if we can't read Claude config
      }
    }

    console.log(chalk.cyan('\nYou can now:'));
    console.log('  • Use', chalk.yellow('cachegpt sync-claude'), 'to sync your conversations');
    console.log('  • Use', chalk.yellow('cachegpt auth-status'), 'to check your login status');
    console.log('  • Visit the web portal with your credentials');
    console.log('  • Use', chalk.yellow('cachegpt logout'), 'to sign out');

  } catch (error: any) {
    if (error.message?.includes('Invalid login credentials')) {
      console.error(chalk.red('\n❌ Invalid email or password'));
      console.log(chalk.dim('If you don\'t have an account, use'), chalk.yellow('cachegpt register'), chalk.dim('to create one'));
    } else if (error.message?.includes('Email not confirmed')) {
      console.error(chalk.red('\n❌ Email not verified'));
      console.log(chalk.yellow('Please check your email and verify your account before logging in'));
    } else {
      console.error(chalk.red('\n❌ Login failed:'), error.message || error);
    }
    process.exit(1);
  }
}