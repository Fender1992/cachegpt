import chalk from 'chalk';
import { loadConfig } from '../lib/config';
import { CredentialStore } from '../lib/credential-store';
import { isTokenExpired } from '../lib/oauth';
import * as fs from 'fs';
import * as path from 'path';

// Get version from package.json
function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    return 'unknown';
  }
}

export async function statusCommand(): Promise<void> {
  const config = loadConfig();
  const credentialStore = new CredentialStore();
  const version = getVersion();

  console.log(chalk.cyan.bold('\n📊 CacheGPT CLI Status\n'));

  // Display version info prominently
  console.log(chalk.white('Version Information:'));
  console.log(chalk.green(`  📦 CLI Version: v${version}`));
  console.log(chalk.gray('  💡 Latest: npm install -g cachegpt-cli@latest'));
  console.log();

  if (!config) {
    console.log(chalk.red('❌ Not configured'));
    console.log(chalk.gray('\nRun "cachegpt init" to set up authentication.\n'));
    return;
  }

  // Display configuration info
  console.log(chalk.white('Configuration:'));
  console.log(chalk.gray(`  Mode: ${(config as any).mode || 'browser'}`));
  console.log(chalk.gray(`  Provider: ${(config as any).provider || 'unknown'}`));
  console.log(chalk.gray(`  Auth Method: ${(config as any).authMethod || 'api'}`));
  console.log(chalk.gray(`  Model: ${config.defaultModel || 'default'}`));
  console.log(chalk.gray(`  Cache: ${(config as any).cacheEnabled !== false ? 'Enabled' : 'Disabled'}`));
  console.log();

  // Check OAuth accounts
  const accounts = await credentialStore.listAccounts();

  if (accounts.length > 0) {
    console.log(chalk.white('Authenticated Accounts:'));

    for (const account of accounts) {
      const credentials = await credentialStore.retrieve(account);
      if (credentials) {
        const status = getTokenStatus(credentials.expiresAt);
        const statusIcon = status === 'valid' ? '✅' : status === 'expired' ? '❌' : '⏰';
        const statusColor = status === 'valid' ? chalk.green : status === 'expired' ? chalk.red : chalk.yellow;

        console.log(chalk.gray(`  ${statusIcon} ${account}`));
        console.log(statusColor(`     Status: ${status}`));

        if (credentials.provider) {
          console.log(chalk.gray(`     Provider: ${credentials.provider}`));
        }

        if (credentials.expiresAt) {
          const expiryDate = new Date(credentials.expiresAt);
          console.log(chalk.gray(`     Expires: ${expiryDate.toLocaleString()}`));
        }

        console.log();
      }
    }
  } else if ((config as any).authMethod === 'api' || (config as any).authMethod === 'token') {
    console.log(chalk.white('Authentication:'));

    if ((config as any).authMethod === 'api') {
      console.log(chalk.green('  ✅ API Key configured'));
    } else if ((config as any).authMethod === 'token') {
      console.log(chalk.green('  ✅ Session token configured'));
    }

    console.log();
  } else {
    console.log(chalk.yellow('⚠️  No authenticated accounts found'));
    console.log(chalk.gray('\nRun "cachegpt init" to authenticate.\n'));
  }

  // Display available commands
  console.log(chalk.white('Available Commands:'));
  console.log(chalk.gray('  cachegpt chat    - Start chatting'));
  console.log(chalk.gray('  cachegpt init    - Add new account'));
  console.log(chalk.gray('  cachegpt logout  - Remove accounts'));
  console.log(chalk.gray('  cachegpt stats   - View cache statistics'));
  console.log();
}

function getTokenStatus(expiresAt?: number): string {
  if (!expiresAt) {
    return 'no expiry';
  }

  if (isTokenExpired(expiresAt)) {
    return 'expired';
  }

  const hoursRemaining = Math.floor((expiresAt - Date.now()) / (1000 * 60 * 60));

  if (hoursRemaining < 24) {
    return `expires soon (${hoursRemaining}h)`;
  }

  return 'valid';
}