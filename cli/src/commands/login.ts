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

    // Prompt for login credentials
    const emailAnswer = await inquirer.prompt({
        type: 'input',
        name: 'email',
        message: 'Email:',
        validate: (value) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value) || 'Please enter a valid email address';
        },
      });

    const passwordAnswer = await inquirer.prompt({
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
      });

    const answers = { ...emailAnswer, ...passwordAnswer };

    const spinner = ora('Logging in...').start();

    // Login the user
    const user = await authService.login(answers.email, answers.password);

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