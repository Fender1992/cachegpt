#!/usr/bin/env node

const chalk = require('chalk');
const { execSync } = require('child_process');

// Try to install Playwright browsers if needed (for Claude Web login)
if (process.env.npm_config_global === 'true' || process.env.npm_config_local === undefined) {
  try {
    console.log(chalk.gray('Setting up browser automation for Claude Web login...'));
    execSync('npx playwright install chromium', { stdio: 'ignore' });
  } catch (error) {
    // Playwright installation is optional
    console.log(chalk.yellow('Note: Browser automation setup skipped (optional - only needed for Claude Web login)'));
  }
}

// Only show this message when installed globally, not during development
if (process.env.npm_config_global === 'true' || process.env.npm_config_local === undefined) {
  console.log();
  console.log(chalk.cyan.bold('═══════════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                                                               '));
  console.log(chalk.cyan.bold('    🚀 CacheGPT CLI installed successfully!                   '));
  console.log(chalk.cyan.bold('                                                               '));
  console.log(chalk.cyan.bold('═══════════════════════════════════════════════════════════════'));
  console.log();
  console.log(chalk.white.bold('Quick Start:'));
  console.log();
  console.log(chalk.green('  # Initialize configuration'));
  console.log(chalk.white.bold('  cachegpt init'));
  console.log(chalk.gray('    → For Claude: Choose "Claude Web Login" (automatic!)'));
  console.log(chalk.gray('    → For others: Use API keys'));
  console.log();
  console.log(chalk.green('  # Start chatting with caching'));
  console.log(chalk.white.bold('  cachegpt chat'));
  console.log();
  console.log(chalk.green('  # View statistics'));
  console.log(chalk.white.bold('  cachegpt stats'));
  console.log();
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'));
  console.log();
  console.log(chalk.gray('💡 CacheGPT works with your existing OpenAI, Anthropic, or other LLM API keys'));
  console.log(chalk.gray('   It intelligently caches responses to save costs and improve speed.'));
  console.log();
  console.log(chalk.yellow('📚 Documentation: https://cachegpt.io/docs'));
  console.log(chalk.yellow('💬 Support: https://github.com/cachegpt/cachegpt-cli/issues'));
  console.log();
}