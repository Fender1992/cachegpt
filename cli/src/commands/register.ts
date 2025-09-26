#!/usr/bin/env node
import chalk from 'chalk';

export async function registerCommand() {
  console.log(chalk.cyan('🚀 Register for CacheGPT'));
  console.log(chalk.yellow('💡 Use the new console signup command instead:'));
  console.log(chalk.white('   cachegpt signup'));
  console.log(chalk.dim('\nThis creates your account directly in the terminal!\n'));

  // Import and run the new signup command
  const { signupConsoleCommand } = await import('./signup-console');
  await signupConsoleCommand();
}