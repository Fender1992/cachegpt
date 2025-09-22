#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from '../lib/auth-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function loginCommand() {
  console.log(chalk.cyan('🔐 Login to CacheGPT\n'));

  try {
    // Load environment config if available
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key.trim()] = value.trim().replace(/["']/g, '');
        }
      });
    }

    // Initialize auth service
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

    // Open browser for OAuth login
    console.log(chalk.cyan('🌐 Opening browser for authentication...\n'));

    const open = await import('open').catch(() => null);
    const authUrl = 'https://cachegpt-1zyg7ani5-rolando-fenders-projects.vercel.app/login';

    if (open) {
      await open.default(authUrl);
      console.log(chalk.green('✅ Browser opened to login page'));
    } else {
      console.log(chalk.yellow('Please open this URL in your browser:'));
      console.log(chalk.blue.underline(authUrl));
    }

    console.log();
    console.log(chalk.gray('Complete the OAuth login in your browser (Google or GitHub).'));
    console.log(chalk.gray('After logging in, copy the session token from the success page.'));
    console.log();

    // Wait for user to complete OAuth and get session token
    const { sessionToken } = await inquirer.prompt({
      type: 'password',
      name: 'sessionToken',
      message: 'Paste your session token here:',
      mask: '*',
      validate: (value) => {
        if (!value.trim()) {
          return 'Session token is required';
        }
        return true;
      }
    });

    const spinner = ora('Verifying session...').start();

    // Store the session token and authenticate
    await authService.setSessionToken(sessionToken);
    const user = await authService.getCurrentUser();

    if (!user) {
      spinner.fail('Invalid session token');
      throw new Error('Could not authenticate with provided token');
    }

    spinner.succeed('Logged in successfully!');

    console.log(chalk.green('\n✅ Authentication successful!'));
    console.log(chalk.dim('Email:', user.email));
    console.log(chalk.dim('User ID:', user.id));

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
    console.log('  • Use', chalk.yellow('llm-cache sync-claude'), 'to sync your conversations');
    console.log('  • Use', chalk.yellow('llm-cache auth-status'), 'to check your login status');
    console.log('  • Visit the web portal with your credentials');
    console.log('  • Use', chalk.yellow('llm-cache logout'), 'to sign out');

  } catch (error: any) {
    if (error.message?.includes('Invalid login credentials')) {
      console.error(chalk.red('\n❌ Invalid email or password'));
      console.log(chalk.dim('If you don\'t have an account, use'), chalk.yellow('llm-cache register'), chalk.dim('to create one'));
    } else if (error.message?.includes('Email not confirmed')) {
      console.error(chalk.red('\n❌ Email not verified'));
      console.log(chalk.yellow('Please check your email and verify your account before logging in'));
    } else {
      console.error(chalk.red('\n❌ Login failed:'), error.message || error);
    }
    process.exit(1);
  }
}