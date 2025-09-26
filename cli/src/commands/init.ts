#!/usr/bin/env node
import chalk from 'chalk';

/**
 * Deprecated initialization command - redirects to login
 */
export async function initCommand(): Promise<void> {
  console.log(chalk.cyan('🔧 CacheGPT Setup'));
  console.log(chalk.yellow('💡 The init command is deprecated. Use login instead:'));
  console.log(chalk.white('   cachegpt login --console   (console-based login)'));
  console.log(chalk.white('   cachegpt login             (browser-based login)'));
  console.log(chalk.white('   cachegpt signup            (create new account)'));
  console.log(chalk.dim('\nStarting login process...\n'));

  // Import and run the login command
  const { loginCommand } = await import('./login');
  await loginCommand();
}