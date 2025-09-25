import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import { CredentialStore } from '../lib/credential-store';
import { getConfigPath } from '../lib/config';
import { TokenManager } from '../lib/token-manager';

export async function logoutCommand(): Promise<void> {
  const credentialStore = new CredentialStore();
  const tokenManager = new TokenManager();
  const accounts = await credentialStore.listAccounts();

  console.log(chalk.cyan.bold('\n🔐 CacheGPT Logout\n'));

  // Check both old credential store and new token manager
  const hasTokens = tokenManager.getStorageStatus();
  const hasAccounts = accounts.length > 0 || hasTokens.webSessions.length > 0 || hasTokens.apiKeys.length > 0;

  if (!hasAccounts) {
    console.log(chalk.yellow('No authenticated accounts found.'));
    console.log(chalk.gray('\nRun "cachegpt init" to authenticate.\n'));
    return;
  }

  // Display current accounts
  console.log(chalk.white('Current accounts:'));

  // Show old credential store accounts
  accounts.forEach(account => {
    console.log(chalk.gray(`  • ${account} (legacy)`));
  });

  // Show TokenManager accounts
  if (hasTokens.webSessions.length > 0) {
    hasTokens.webSessions.forEach((provider: string) => {
      console.log(chalk.gray(`  • ${provider} (web session)`));
    });
  }

  if (hasTokens.apiKeys.length > 0) {
    hasTokens.apiKeys.forEach((provider: string) => {
      console.log(chalk.gray(`  • ${provider} (API key)`));
    });
  }

  console.log();

  // Ask what to do
  const { action } = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: 'Logout from all accounts', value: 'all' },
      { name: 'Logout from specific account', value: 'specific' },
      { name: 'Cancel', value: 'cancel' }
    ]
  });

  if (action === 'cancel') {
    console.log(chalk.gray('\nCancelled.\n'));
    return;
  }

  if (action === 'all') {
    // Confirm deletion of all accounts
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to logout from all accounts?',
      default: false
    });

    if (!confirm) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }

    // Delete all accounts from old credential store
    for (const account of accounts) {
      await credentialStore.delete(account);
      console.log(chalk.gray(`  ✓ Removed ${account} (legacy)`));
    }

    // Clear all TokenManager credentials
    tokenManager.clearAllCredentials();
    console.log(chalk.gray(`  ✓ Cleared all web sessions and API keys`));

    // Also clear the config file if it exists
    try {
      const configPath = getConfigPath();
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Reset auth-related fields
        if (config.authMethod === 'oauth') {
          delete config.authMethod;
          delete config.userEmail;
          delete config.userId;
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }
      }
    } catch {
      // Ignore config errors
    }

    console.log(chalk.green('\n✅ Successfully logged out from all accounts.\n'));

  } else if (action === 'specific') {
    // Build list of all accounts
    const allAccounts: string[] = [...accounts];

    // Add TokenManager accounts
    hasTokens.webSessions.forEach((provider: string) => {
      allAccounts.push(`${provider} (web session)`);
    });
    hasTokens.apiKeys.forEach((provider: string) => {
      allAccounts.push(`${provider} (API key)`);
    });

    // Select specific account to remove
    const { selectedAccount } = await inquirer.prompt({
      type: 'list',
      name: 'selectedAccount',
      message: 'Select account to logout:',
      choices: [...allAccounts, 'Cancel']
    });

    if (selectedAccount === 'Cancel') {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }

    // Confirm deletion
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to logout from ${selectedAccount}?`,
      default: false
    });

    if (!confirm) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }

    // Delete the account
    if (selectedAccount.includes('(web session)')) {
      // Handle TokenManager web session
      const provider = selectedAccount.replace(' (web session)', '');
      tokenManager.clearWebSession(provider);
      console.log(chalk.green(`\n✅ Successfully cleared ${provider} web session.\n`));
    } else if (selectedAccount.includes('(API key)')) {
      // Handle TokenManager API key
      const provider = selectedAccount.replace(' (API key)', '');
      tokenManager.clearAPIKey(provider);
      console.log(chalk.green(`\n✅ Successfully cleared ${provider} API key.\n`));
    } else {
      // Handle legacy credential store
      await credentialStore.delete(selectedAccount);
      console.log(chalk.green(`\n✅ Successfully logged out from ${selectedAccount}.\n`));
    }
  }

  // Check if any accounts remain
  const remainingAccounts = await credentialStore.listAccounts();
  if (remainingAccounts.length === 0) {
    console.log(chalk.yellow('No accounts remaining.'));
    console.log(chalk.gray('Run "cachegpt init" to authenticate again.\n'));
  } else {
    console.log(chalk.gray('Remaining accounts:'));
    remainingAccounts.forEach(account => {
      console.log(chalk.gray(`  • ${account}`));
    });
    console.log();
  }
}