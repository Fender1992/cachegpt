import chalk from 'chalk';
import Table from 'cli-table3';
import { TokenClient, createStorageAdapter } from '@cachegpt/auth-sdk';
import { loadConfig, getIssuerMetadata } from '../config';
import { createLogger } from '../logger';

export async function statusCommand() {
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

    const isAuthenticated = await tokenClient.isAuthenticated();
    const tokens = await tokenClient.getStoredTokens();
    const storageAdapter = await createStorageAdapter();

    // Create status table
    const table = new Table({
      head: ['Property', 'Value'],
      style: { head: ['cyan'] },
      colWidths: [25, 50]
    });

    // Authentication status
    table.push(
      ['Authenticated', isAuthenticated ? chalk.green('Yes') : chalk.red('No')],
      ['Storage Backend', chalk.yellow(storageAdapter.getBackendName())]
    );

    if (tokens) {
      // Token information
      table.push(['Token Type', tokens.token_type || 'Bearer']);

      if (tokens.scope) {
        table.push(['Scopes', tokens.scope]);
      }

      if (tokens.expires_at) {
        const expiresAt = new Date(tokens.expires_at * 1000);
        const now = new Date();
        const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

        if (remaining > 0) {
          const hours = Math.floor(remaining / 3600);
          const minutes = Math.floor((remaining % 3600) / 60);
          const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

          table.push([
            'Token Expires',
            `${expiresAt.toLocaleString()} (in ${timeStr})`
          ]);
        } else {
          table.push(['Token Expires', chalk.red('Expired')]);
        }
      }

      table.push([
        'Has Refresh Token',
        tokens.refresh_token ? chalk.green('Yes') : chalk.yellow('No')
      ]);

      if (tokens.id_token) {
        table.push(['Has ID Token', chalk.green('Yes')]);
      }

      // Access token info (masked)
      if (tokens.access_token) {
        const masked = maskToken(tokens.access_token);
        table.push(['Access Token', chalk.dim(masked)]);
      }
    }

    // Display table
    console.log(chalk.bold('\nAuthentication Status:\n'));
    console.log(table.toString());

    if (!isAuthenticated) {
      console.log(chalk.yellow('\nRun "cachegpt login" to authenticate'));
    } else if (tokens?.expires_at) {
      const expiresAt = new Date(tokens.expires_at * 1000);
      const now = new Date();
      const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

      if (remaining < 300) { // Less than 5 minutes
        console.log(chalk.yellow('\n⚠ Token expires soon. It will be automatically refreshed when needed.'));
      }
    }

  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

function maskToken(token: string): string {
  if (token.length <= 20) {
    return '[REDACTED]';
  }
  return `${token.substring(0, 8)}...[REDACTED]...${token.substring(token.length - 8)}`;
}