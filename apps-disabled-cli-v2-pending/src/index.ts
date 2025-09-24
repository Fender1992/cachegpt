#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { loginCommand } from './commands/login';
import { whoamiCommand } from './commands/whoami';
import { statusCommand } from './commands/status';
import { logoutCommand } from './commands/logout';
import { diagCommand } from './commands/diag';
import { version } from '../package.json';

const program = new Command();

program
  .name('cachegpt')
  .description('CacheGPT CLI - Intelligent LLM caching and optimization')
  .version(version);

program
  .command('login')
  .description('Authenticate with CacheGPT')
  .option('--device', 'Use device code flow (for headless/SSH environments)')
  .option('--verbose', 'Enable verbose logging')
  .action(loginCommand);

program
  .command('whoami')
  .description('Display current user information')
  .action(whoamiCommand);

program
  .command('status')
  .description('Show authentication status and token information')
  .action(statusCommand);

program
  .command('logout')
  .description('Sign out and clear stored credentials')
  .action(logoutCommand);

program
  .command('diag')
  .description('Run diagnostics and connectivity tests')
  .action(diagCommand);

// Error handling
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'commander.unknownCommand') {
      console.error(chalk.red(`Unknown command: ${error.message}`));
      console.log(chalk.yellow('Run "cachegpt --help" to see available commands'));
    } else if (error.code === 'commander.help') {
      // Help was displayed, exit normally
      process.exit(0);
    } else {
      console.error(chalk.red('Error:'), error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled promise rejection:'), reason);
  if (process.env.DEBUG) {
    console.error('Promise:', promise);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nInterrupted by user'));
  process.exit(130);
});

main();