import chalk from 'chalk';
import ora from 'ora';
import { TokenClient } from '@cachegpt/auth-sdk';
import { loadConfig, getIssuerMetadata } from '../config';
import { createLogger } from '../logger';
import open from 'open';

interface LoginOptions {
  device?: boolean;
  verbose?: boolean;
}

export async function loginCommand(options: LoginOptions) {
  const logger = createLogger(options.verbose);
  const spinner = ora();

  try {
    // Load configuration
    const config = loadConfig();
    logger.debug('Configuration loaded', config);

    // Get issuer metadata
    spinner.start('Discovering authentication endpoints...');
    const metadata = await getIssuerMetadata(config);
    spinner.succeed('Authentication endpoints discovered');

    // Check if already authenticated
    const tokenClient = new TokenClient({
      issuerUrl: metadata.issuer,
      clientId: config.clientId,
      scopes: config.scopes,
      logger: logger
    });

    await tokenClient.initialize();

    if (await tokenClient.isAuthenticated()) {
      const userInfo = await tokenClient.getUserInfo();
      console.log(chalk.yellow('You are already logged in as:'), chalk.cyan(maskEmail(userInfo.email)));

      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('Do you want to logout and login again? (y/N): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        return;
      }

      await tokenClient.revokeAndSignOut();
      console.log(chalk.dim('Logged out successfully\n'));
    }

    // Check for device code flow
    if (options.device || !metadata.authorization_endpoint) {
      if (!metadata.device_authorization_endpoint) {
        console.error(chalk.red('Device code flow is not supported by this authentication provider'));
        process.exit(1);
      }

      console.log(chalk.cyan('Using device code flow for authentication\n'));

      tokenClient.on('device_code', (data) => {
        console.log(chalk.bold('Please visit:'), chalk.cyan.underline(data.verification_uri));
        console.log(chalk.bold('And enter code:'), chalk.yellow(data.user_code));
        console.log();
        spinner.start('Waiting for authorization...');
      });

      const result = await tokenClient.signInDeviceCode();
      spinner.succeed('Authentication successful!');

      displayAuthResult(result);
    } else {
      // PKCE flow
      console.log(chalk.cyan('Opening browser for authentication...\n'));

      // Set up event listeners for debugging
      if (options.verbose) {
        tokenClient.on('debug', (msg) => logger.debug(msg));
        tokenClient.on('info', (msg) => logger.info(msg));
      }

      const result = await tokenClient.signInInteractivePkce();

      console.log(chalk.green('✓ Authentication successful!\n'));
      displayAuthResult(result);
    }

    // Store provider API keys if needed
    console.log(chalk.dim('\nTo configure LLM provider API keys, visit:'));
    console.log(chalk.cyan.underline(`${config.apiUrl.replace('/api', '')}/auth/provider-setup`));

  } catch (error: any) {
    spinner.fail('Authentication failed');
    console.error(chalk.red('Error:'), error.message);

    if (options.verbose) {
      console.error(chalk.dim(error.stack));
    }

    // Provide helpful error messages
    if (error.message.includes('browser')) {
      console.log(chalk.yellow('\nTip: Use --device flag for headless/SSH environments'));
    } else if (error.message.includes('timeout')) {
      console.log(chalk.yellow('\nTip: Authentication timed out. Please try again.'));
    } else if (error.message.includes('network')) {
      console.log(chalk.yellow('\nTip: Check your internet connection and firewall settings'));
    }

    process.exit(1);
  }
}

function displayAuthResult(result: any) {
  const { userInfo } = result;

  if (userInfo) {
    console.log(chalk.bold('Logged in as:'));
    console.log('  Email:', chalk.cyan(maskEmail(userInfo.email)));
    console.log('  Name:', chalk.cyan(userInfo.name || 'N/A'));
    console.log('  Subject:', chalk.dim(userInfo.sub));
  }

  console.log();
  console.log(chalk.green('✓'), 'Credentials stored securely');
  console.log(chalk.dim('Run "cachegpt status" to view token details'));
}

function maskEmail(email?: string): string {
  if (!email) return 'N/A';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `**@${domain}`;
  }
  return `${localPart.substring(0, 2)}***@${domain}`;
}