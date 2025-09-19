#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from '../lib/auth-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function registerCommand() {
  console.log(chalk.cyan('🚀 Register for CacheGPT\n'));

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

    // Prompt for registration details
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Email:',
        validate: (value: any) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value) || 'Please enter a valid email address';
        },
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
        validate: (value: any) => {
          return value.length >= 6 || 'Password must be at least 6 characters';
        },
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm Password:',
        mask: '*',
        validate: (value: any, answers: any) => {
          return value === answers.password || 'Passwords do not match';
        },
      },
    ]);

    const spinner = ora('Creating your account...').start();

    // Initialize auth service
    const authService = new AuthService();

    // Register the user
    const user = await authService.register(answers.email, answers.password);

    spinner.succeed('Account created successfully!');

    console.log(chalk.green('\n✅ Registration complete!'));
    console.log(chalk.dim('Email:', user.email));
    console.log(chalk.dim('User ID:', user.id));

    // Store Claude user ID if available
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeConfigPath)) {
      try {
        const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
        if (claudeConfig.userID) {
          const configDir = path.join(os.homedir(), '.cachegpt');
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
    console.log('  • Use', chalk.yellow('llm-cache login'), 'to sign in');
    console.log('  • Use', chalk.yellow('llm-cache sync-claude'), 'to sync your conversations');
    console.log('  • Visit the web portal to view your data');

    // Check if email verification is required
    if (user.email && !user.email_confirmed_at) {
      console.log(chalk.yellow('\n⚠️  Please check your email to verify your account'));
    }

  } catch (error: any) {
    if (error.message?.includes('User already registered')) {
      console.error(chalk.red('\n❌ This email is already registered'));
      console.log(chalk.dim('Use'), chalk.yellow('llm-cache login'), chalk.dim('to sign in'));
    } else {
      console.error(chalk.red('\n❌ Registration failed:'), error.message || error);
    }
    process.exit(1);
  }
}