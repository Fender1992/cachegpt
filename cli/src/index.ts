#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { testCommand } from './commands/test';
import { statsCommand } from './commands/stats';
import { clearCommand } from './commands/clear';
import { configCommand } from './commands/config';
import { chatCommand } from './commands/chat';
import { statusCommand } from './commands/status';
import { logoutCommand } from './commands/logout';
import { syncClaude } from './commands/sync-claude';
import { registerCommand } from './commands/register';
import { loginCommand } from './commands/login';
import { authStatusCommand } from './commands/auth-status';
import { templatesCommand } from './commands/templates';
import { chatApiCommand } from './commands/chat-api';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

// Get version from package.json
function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    return '10.0.2'; // Fallback version
  }
}

// Set up error handling
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

program
  .name('cachegpt')
  .description('CacheGPT CLI - Intelligent LLM caching with browser authentication')
  .version(getVersion());

program
  .command('init')
  .description('Initialize LLM Cache configuration')
  .action(initCommand);

program
  .command('test')
  .description('Test API connectivity and cache functionality')
  .option('-m, --model <model>', 'LLM model to test', 'gpt-3.5-turbo')
  .option('-q, --query <query>', 'Test query', 'Hello, world!')
  .action(testCommand);

program
  .command('stats')
  .description('Show cache statistics')
  .option('-d, --days <days>', 'Number of days to show', '7')
  .action(statsCommand);

program
  .command('clear')
  .description('Clear cache entries')
  .option('--all', 'Clear all cache entries')
  .option('--older-than <hours>', 'Clear entries older than X hours', '24')
  .action(clearCommand);

program
  .command('config')
  .description('Manage configuration')
  .option('--show', 'Show current configuration')
  .option('--set <key=value>', 'Set configuration value')
  .action(configCommand);

program
  .command('chat')
  .description('Start interactive chat with your LLM')
  .action(chatCommand);

program
  .command('chat-api')
  .description('Chat using Claude API directly (private, no web console logging)')
  .action(chatApiCommand);

program
  .command('status')
  .description('Check authentication status and active accounts')
  .action(statusCommand);

program
  .command('logout')
  .description('Log out from authenticated accounts')
  .action(logoutCommand);

program
  .command('register')
  .description('Create a new CacheGPT account')
  .action(registerCommand);

program
  .command('login')
  .description('Login to your CacheGPT account')
  .action(loginCommand);

program
  .command('auth-status')
  .description('Check current authentication status')
  .action(authStatusCommand);

program
  .command('sync-claude')
  .description('Sync Claude Code conversations to Supabase database')
  .option('--all', 'Sync all conversation files')
  .option('--recent', 'Sync conversations from last 24 hours')
  .option('--api-url <url>', 'API URL for syncing', process.env.CACHEGPT_API_URL || 'http://localhost:3000')
  .action((options) => {
    syncClaude(options).catch((error) => {
      console.error(chalk.red('Sync failed:'), error.message);
      process.exit(1);
    });
  });





program
  .command('templates [action] [args...]')
  .description('Manage prompt templates for common tasks')
  .action(templatesCommand);

// Parse CLI arguments
program.parse();

// If no command is provided, show help
if (process.argv.length === 2) {
  program.help();
}