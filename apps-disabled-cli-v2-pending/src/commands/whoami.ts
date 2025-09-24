import chalk from 'chalk';
import ora from 'ora';
import { TokenClient } from '@cachegpt/auth-sdk';
import { loadConfig, getIssuerMetadata } from '../config';
import { createLogger } from '../logger';

export async function whoamiCommand() {
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
      console.log(chalk.dim('Run "cachegpt login" to authenticate'));
      process.exit(1);
    }

    spinner.start('Fetching user information...');
    const userInfo = await tokenClient.getUserInfo();
    spinner.stop();

    console.log(chalk.bold('Current User:\n'));
    console.log('  Email:', chalk.cyan(maskEmail(userInfo.email)));
    console.log('  Name:', chalk.cyan(userInfo.name || 'N/A'));
    console.log('  Verified:', userInfo.email_verified ? chalk.green('Yes') : chalk.yellow('No'));
    console.log('  Subject:', chalk.dim(userInfo.sub));

    if (userInfo.picture) {
      console.log('  Avatar:', chalk.dim(userInfo.picture));
    }

  } catch (error: any) {
    spinner.fail('Failed to fetch user information');
    console.error(chalk.red('Error:'), error.message);

    if (error.message.includes('Not authenticated')) {
      console.log(chalk.yellow('\nPlease run "cachegpt login" first'));
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