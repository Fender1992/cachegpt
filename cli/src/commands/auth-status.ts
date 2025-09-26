#!/usr/bin/env node
import chalk from 'chalk';
import { TokenManager } from '../lib/token-manager';
import * as fs from 'fs';
import * as path from 'path';

export async function authStatusCommand() {
  console.log(chalk.cyan('🔍 Authentication Status\n'));

  try {
    const tokenManager = new TokenManager();

    // Check authentication status
    try {
      const auth = tokenManager.getCacheGPTAuth();

      console.log(chalk.green('✅ Logged in'));
      console.log(chalk.dim('Email:'), auth.userEmail || 'Unknown');
      console.log(chalk.dim('User ID:'), auth.userId);
      console.log(chalk.dim('Created:'), new Date(auth.createdAt).toLocaleDateString());
      console.log(chalk.dim('Expires:'), new Date(auth.expiresAt).toLocaleDateString());

      // Show token preview
      console.log(chalk.dim('\nAccess token:'), chalk.green('Valid'));
      console.log(chalk.dim('Token preview:'), auth.value.substring(0, 20) + '...');

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

      console.log(chalk.cyan('\nAvailable commands:'));
      console.log('  • Use', chalk.yellow('cachegpt chat'), 'to start chatting');
      console.log('  • Use', chalk.yellow('cachegpt sync-claude'), 'to sync conversations');
      console.log('  • Use', chalk.yellow('cachegpt logout'), 'to sign out');

    } catch (error) {
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