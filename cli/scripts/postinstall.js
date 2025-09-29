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
  console.log(chalk.cyan.bold('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║                                                               ║'));
  console.log(chalk.cyan.bold('║        🚀 CacheGPT CLI v11.1.14 - Free AI Chat               ║'));
  console.log(chalk.cyan.bold('║                                                               ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white.bold('🎯 Quick Start:'));
  console.log();
  console.log(chalk.green('  cachegpt login') + chalk.gray('        # Login with Google/GitHub (no API keys needed!)'));
  console.log(chalk.green('  cachegpt chat') + chalk.gray('         # Start free AI chat with smart caching'));
  console.log();
  console.log(chalk.white.bold('📚 All Commands:'));
  console.log();
  console.log(chalk.yellow('  Authentication:'));
  console.log('  ' + chalk.white('cachegpt login') + chalk.gray('        # Login via browser (Google/GitHub)'));
  console.log('  ' + chalk.white('cachegpt signup') + chalk.gray('       # Create new account'));
  console.log('  ' + chalk.white('cachegpt logout') + chalk.gray('       # Logout from current session'));
  console.log('  ' + chalk.white('cachegpt auth-status') + chalk.gray('  # Check authentication status'));
  console.log();
  console.log(chalk.yellow('  Chat & AI:'));
  console.log('  ' + chalk.white('cachegpt chat') + chalk.gray('         # Start free AI chat'));
  console.log('  ' + chalk.white('cachegpt claude') + chalk.gray('       # Setup Claude web session'));
  console.log();
  console.log(chalk.yellow('  Management:'));
  console.log('  ' + chalk.white('cachegpt config') + chalk.gray('       # Manage configuration'));
  console.log('  ' + chalk.white('cachegpt stats') + chalk.gray('        # View usage statistics'));
  console.log('  ' + chalk.white('cachegpt status') + chalk.gray('       # Check system status'));
  console.log('  ' + chalk.white('cachegpt clear') + chalk.gray('        # Clear cache or config'));
  console.log('  ' + chalk.white('cachegpt version') + chalk.gray('      # Show version info'));
  console.log();
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'));
  console.log();
  console.log(chalk.green.bold('✨ Features:'));
  console.log(chalk.gray('  • Free AI chat with no API keys required'));
  console.log(chalk.gray('  • Smart caching saves repeated responses'));
  console.log(chalk.gray('  • Works with Google/GitHub OAuth login'));
  console.log(chalk.gray('  • Supports Claude web sessions'));
  console.log();
  console.log(chalk.yellow('📚 Documentation: https://cachegpt.io'));
  console.log(chalk.yellow('💬 Support: https://github.com/cachegpt/cachegpt-cli/issues'));
  console.log();
}