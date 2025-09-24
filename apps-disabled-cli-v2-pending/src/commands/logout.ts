import chalk from 'chalk';
import ora from 'ora';
import { TokenClient } from '@cachegpt/auth-sdk';
import { loadConfig, getIssuerMetadata } from '../config';
import { createLogger } from '../logger';

export async function logoutCommand() {
  const spinner = ora();
  const logger = createLogger(false);

  try {
    const config = loadConfig();
    const metadata = await getIssuerMetadata(config);

    const tokenClient = new TokenClient({
      issuerUrl: metadata.issuer,
      clientId: config.clientId,
      scopes: config.scopes,
      logger: logger
    });

    await tokenClient.initialize();

    if (!await tokenClient.isAuthenticated()) {
      console.log(chalk.yellow('Not logged in'));
      return;
    }

    // Get user info before logout
    let userEmail: string | undefined;
    try {
      const userInfo = await tokenClient.getUserInfo();
      userEmail = userInfo.email;
    } catch {
      // Ignore if we can't get user info
    }

    spinner.start('Signing out...');

    // Revoke tokens and clear storage
    await tokenClient.revokeAndSignOut();

    spinner.succeed('Signed out successfully');

    if (userEmail) {
      console.log(chalk.dim(`Logged out from: ${maskEmail(userEmail)}`));
    }

    console.log(chalk.dim('All stored credentials have been cleared'));

  } catch (error: any) {
    spinner.fail('Failed to sign out');
    console.error(chalk.red('Error:'), error.message);

    // Try to clear local storage anyway
    try {
      const { createStorageAdapter } = await import('@cachegpt/auth-sdk');
      const storage = await createStorageAdapter();
      await storage.clearTokens();
      console.log(chalk.yellow('Local credentials cleared'));
    } catch {
      console.log(chalk.red('Failed to clear local credentials'));
    }

    process.exit(1);
  }
}

function maskEmail(email?: string): string {
  if (!email) return 'N/A';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `**@${domain}`;
  }
  return `${localPart.substring(0, 2)}***@${domain}`;
}