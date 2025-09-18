import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import { CredentialStore } from '../lib/credential-store';
import { getConfigPath } from '../lib/config';

export async function logoutCommand(): Promise<void> {
  const credentialStore = new CredentialStore();
  const accounts = await credentialStore.listAccounts();

  console.log(chalk.cyan.bold('\n🔐 CacheGPT Logout\n'));

  if (accounts.length === 0) {
    console.log(chalk.yellow('No authenticated accounts found.'));
    console.log(chalk.gray('\nRun "cachegpt init" to authenticate.\n'));
    return;
  }

  // Display current accounts
  console.log(chalk.white('Current accounts:'));
  accounts.forEach(account => {
    console.log(chalk.gray(`  • ${account}`));
  });
  console.log();

  // Ask what to do
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: 'Logout from all accounts', value: 'all' },
      { name: 'Logout from specific account', value: 'specific' },
      { name: 'Cancel', value: 'cancel' }
    ]
  }]);

  if (action === 'cancel') {
    console.log(chalk.gray('\nCancelled.\n'));
    return;
  }

  if (action === 'all') {
    // Confirm deletion of all accounts
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to logout from all accounts?',
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }

    // Delete all accounts
    for (const account of accounts) {
      await credentialStore.delete(account);
      console.log(chalk.gray(`  ✓ Removed ${account}`));
    }

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
    // Select specific account to remove
    const { selectedAccount } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedAccount',
      message: 'Select account to logout:',
      choices: [...accounts, { name: 'Cancel', value: null }]
    }]);

    if (!selectedAccount) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }

    // Confirm deletion
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to logout from ${selectedAccount}?`,
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }

    // Delete the account
    await credentialStore.delete(selectedAccount);
    console.log(chalk.green(`\n✅ Successfully logged out from ${selectedAccount}.\n`));
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