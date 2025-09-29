#!/usr/bin/env node

const chalk = require('chalk');
const { execSync } = require('child_process');

// Skip playwright installation during npm install to prevent recursion
// Users can manually run 'npx playwright install chromium' if needed
if (process.env.npm_config_global === 'true' && process.env.CACHEGPT_SKIP_PLAYWRIGHT !== 'true') {
  console.log(chalk.yellow('Note: To use Claude Web login, manually run: npx playwright install chromium'));
}

// Only show this message when installed globally, not during development
if (process.env.npm_config_global === 'true' || process.env.npm_config_local === undefined) {
  console.log();
  console.log(chalk.cyan.bold('╔═══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║                                                               ║'));
  console.log(chalk.cyan.bold('║        🚀 CacheGPT CLI v11.1.16 - Free AI Chat               ║'));
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
  console.log();
  console.log(chalk.yellow('  Management:'));
  console.log('  ' + chalk.white('cachegpt api-keys') + chalk.gray('     # Manage API keys for premium providers'));
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
  console.log(chalk.gray('  • Optional: Use your own API keys for premium models'));
  console.log(chalk.gray('  • Smart caching saves repeated responses'));
  console.log(chalk.gray('  • Works with Google/GitHub OAuth login'));
  console.log();
  console.log(chalk.yellow('📚 Documentation: https://cachegpt.io'));
  console.log(chalk.yellow('💬 Support: https://github.com/cachegpt/cachegpt-cli/issues'));
  console.log();
}