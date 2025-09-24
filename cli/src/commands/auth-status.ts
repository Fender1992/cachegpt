#!/usr/bin/env node
import chalk from 'chalk';
import { AuthService } from '../lib/auth-service';
import * as fs from 'fs';
import * as path from 'path';

export async function authStatusCommand() {
  console.log(chalk.cyan('🔍 Authentication Status\n'));

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

    // Get current user
    const user = await authService.getCurrentUser();

    if (user) {
      console.log(chalk.green('✅ Logged in'));
      console.log(chalk.dim('Email:'), user.email);
      console.log(chalk.dim('User ID:'), user.id);
      console.log(chalk.dim('Created:'), new Date(user.created_at).toLocaleDateString());

      if (user.email_confirmed_at) {
        console.log(chalk.dim('Email verified:'), chalk.green('Yes'));
      } else {
        console.log(chalk.dim('Email verified:'), chalk.yellow('No - check your email'));
      }

      // Check for Claude user ID
      const userConfigPath = path.join(process.env.HOME || '~', '.cachegpt', 'user-config.json');
      if (fs.existsSync(userConfigPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
          if (config.claude_user_id) {
            console.log(chalk.dim('Claude ID:'), config.claude_user_id.substring(0, 8) + '...');
          }
        } catch (error) {
          // Ignore config read errors
        }
      }

      // Get access token info
      const token = await authService.getAccessToken();
      if (token) {
        console.log(chalk.dim('\nAccess token:'), chalk.green('Valid'));
        console.log(chalk.dim('Token preview:'), token.substring(0, 20) + '...');
      }

      console.log(chalk.cyan('\nAvailable commands:'));
      console.log('  • Use', chalk.yellow('cachegpt sync-claude'), 'to sync conversations');
      console.log('  • Use', chalk.yellow('cachegpt logout'), 'to sign out');

    } else {
      console.log(chalk.yellow('⚠️  Not logged in'));
      console.log(chalk.dim('\nTo authenticate:'));
      console.log('  • Use', chalk.yellow('cachegpt register'), 'to create a new account');
      console.log('  • Use', chalk.yellow('cachegpt login'), 'to sign in');
    }

  } catch (error: any) {
    console.error(chalk.red('❌ Error checking auth status:'), error.message || error);
    process.exit(1);
  }
}