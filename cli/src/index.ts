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
import { analyticsCommand } from './commands/analytics';
import { tagsCommand } from './commands/tags';
import { exportCommand } from './commands/export';
import { rateLimitCommand } from './commands/rate-limit';
import { templatesCommand } from './commands/templates';

const program = new Command();

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
  .name('llm-cache')
  .description('CLI tool for LLM Cache Proxy')
  .version('1.0.0');

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
  .command('analytics')
  .description('Show detailed analytics dashboard')
  .action(analyticsCommand);

program
  .command('tags [action] [args...]')
  .description('Manage chat tags and organization')
  .action(tagsCommand);

program
  .command('export [format] [output]')
  .description('Export chat history in various formats')
  .action(exportCommand);

program
  .command('rate-limit [action]')
  .description('Manage API rate limits and optimization')
  .action(rateLimitCommand);

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