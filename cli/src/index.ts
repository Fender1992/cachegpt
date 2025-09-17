#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { testCommand } from './commands/test';
import { statsCommand } from './commands/stats';
import { clearCommand } from './commands/clear';
import { configCommand } from './commands/config';

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

// Parse CLI arguments
program.parse();

// If no command is provided, show help
if (process.argv.length === 2) {
  program.help();
}