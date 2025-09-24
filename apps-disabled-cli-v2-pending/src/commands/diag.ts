import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { request } from 'undici';
import { createStorageAdapter } from '@cachegpt/auth-sdk';
import { loadConfig, getIssuerMetadata } from '../config';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as tls from 'tls';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function diagCommand() {
  console.log(chalk.bold('Running CacheGPT CLI Diagnostics...\n'));

  const results: DiagnosticResult[] = [];
  const spinner = ora();

  // System Information
  console.log(chalk.cyan('System Information:'));
  const sysTable = new Table({
    head: ['Property', 'Value'],
    style: { head: ['cyan'] },
    colWidths: [25, 50]
  });

  sysTable.push(
    ['Platform', `${os.platform()} (${os.arch()})`],
    ['Node Version', process.version],
    ['Home Directory', os.homedir()],
    ['Current Directory', process.cwd()]
  );

  console.log(sysTable.toString());
  console.log();

  // Run diagnostics
  console.log(chalk.cyan('Running Diagnostics:\n'));

  // 1. Configuration
  spinner.start('Checking configuration...');
  try {
    const config = loadConfig();
    results.push({
      name: 'Configuration',
      status: 'pass',
      message: `Loaded from ${config.issuerUrl}`
    });
    spinner.succeed('Configuration OK');
  } catch (error: any) {
    results.push({
      name: 'Configuration',
      status: 'fail',
      message: error.message
    });
    spinner.fail('Configuration failed');
  }

  // 2. Network Connectivity
  spinner.start('Checking network connectivity...');
  try {
    const config = loadConfig();
    const { statusCode } = await request(config.apiUrl + '/health', {
      method: 'GET',
      headersTimeout: 5000
    });

    if (statusCode === 200 || statusCode === 204) {
      results.push({
        name: 'API Connectivity',
        status: 'pass',
        message: 'API server reachable'
      });
      spinner.succeed('Network connectivity OK');
    } else {
      results.push({
        name: 'API Connectivity',
        status: 'warn',
        message: `API returned status ${statusCode}`
      });
      spinner.warn('Network connectivity warning');
    }
  } catch (error: any) {
    results.push({
      name: 'API Connectivity',
      status: 'fail',
      message: error.message
    });
    spinner.fail('Network connectivity failed');
  }

  // 3. Issuer Discovery
  spinner.start('Checking authentication endpoints...');
  try {
    const config = loadConfig();
    const metadata = await getIssuerMetadata(config);

    if (metadata.authorization_endpoint && metadata.token_endpoint) {
      results.push({
        name: 'Issuer Discovery',
        status: 'pass',
        message: 'All endpoints discovered'
      });
      spinner.succeed('Authentication endpoints OK');
    } else {
      results.push({
        name: 'Issuer Discovery',
        status: 'warn',
        message: 'Some endpoints missing'
      });
      spinner.warn('Authentication endpoints incomplete');
    }
  } catch (error: any) {
    results.push({
      name: 'Issuer Discovery',
      status: 'fail',
      message: error.message
    });
    spinner.fail('Authentication endpoint discovery failed');
  }

  // 4. TLS/SSL
  spinner.start('Checking TLS/SSL...');
  try {
    const config = loadConfig();
    const url = new URL(config.apiUrl);
    await checkTLS(url.hostname, 443);

    results.push({
      name: 'TLS/SSL',
      status: 'pass',
      message: 'Certificate valid'
    });
    spinner.succeed('TLS/SSL OK');
  } catch (error: any) {
    results.push({
      name: 'TLS/SSL',
      status: 'fail',
      message: error.message
    });
    spinner.fail('TLS/SSL check failed');
  }

  // 5. Time Synchronization
  spinner.start('Checking time synchronization...');
  try {
    const config = loadConfig();
    const { headers } = await request(config.apiUrl + '/health', {
      method: 'HEAD',
      headersTimeout: 5000
    });

    const serverDate = headers.date ? new Date(headers.date as string) : null;
    if (serverDate) {
      const localDate = new Date();
      const diff = Math.abs(localDate.getTime() - serverDate.getTime()) / 1000;

      if (diff < 120) {
        results.push({
          name: 'Time Sync',
          status: 'pass',
          message: `Clock skew: ${diff.toFixed(1)}s`
        });
        spinner.succeed('Time synchronization OK');
      } else {
        results.push({
          name: 'Time Sync',
          status: 'warn',
          message: `Clock skew: ${diff.toFixed(1)}s (may cause auth issues)`
        });
        spinner.warn('Time synchronization warning');
      }
    }
  } catch (error: any) {
    results.push({
      name: 'Time Sync',
      status: 'warn',
      message: 'Could not check time sync'
    });
    spinner.warn('Time synchronization check skipped');
  }

  // 6. Storage Access
  spinner.start('Checking storage access...');
  try {
    const adapter = await createStorageAdapter();
    await adapter.initialize();

    // Test write/read/delete
    const testToken = {
      access_token: 'test',
      token_type: 'Bearer',
      expires_in: 3600
    };

    await adapter.saveTokens(testToken);
    const retrieved = await adapter.getTokens();
    await adapter.clearTokens();

    if (retrieved?.access_token === 'test') {
      results.push({
        name: 'Storage Access',
        status: 'pass',
        message: adapter.getBackendName()
      });
      spinner.succeed('Storage access OK');
    } else {
      throw new Error('Storage test failed');
    }
  } catch (error: any) {
    results.push({
      name: 'Storage Access',
      status: 'fail',
      message: error.message
    });
    spinner.fail('Storage access failed');
  }

  // 7. File Permissions
  spinner.start('Checking file permissions...');
  try {
    const configDir = path.join(os.homedir(), '.cachegpt');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    const stats = fs.statSync(configDir);

    if (process.platform !== 'win32') {
      const mode = stats.mode & 0o777;
      if (mode === 0o700) {
        results.push({
          name: 'File Permissions',
          status: 'pass',
          message: `Config dir: 0${mode.toString(8)}`
        });
        spinner.succeed('File permissions OK');
      } else {
        results.push({
          name: 'File Permissions',
          status: 'warn',
          message: `Config dir: 0${mode.toString(8)} (should be 0700)`
        });
        spinner.warn('File permissions warning');
      }
    } else {
      results.push({
        name: 'File Permissions',
        status: 'pass',
        message: 'Windows ACL'
      });
      spinner.succeed('File permissions OK');
    }
  } catch (error: any) {
    results.push({
      name: 'File Permissions',
      status: 'fail',
      message: error.message
    });
    spinner.fail('File permissions check failed');
  }

  // 8. Browser Detection
  spinner.start('Checking browser availability...');
  try {
    const open = await import('open');
    const apps = await open.apps;

    if (apps && apps.length > 0) {
      results.push({
        name: 'Browser',
        status: 'pass',
        message: 'Default browser available'
      });
      spinner.succeed('Browser detection OK');
    } else {
      results.push({
        name: 'Browser',
        status: 'warn',
        message: 'No default browser (use --device flag)'
      });
      spinner.warn('Browser not detected');
    }
  } catch (error: any) {
    results.push({
      name: 'Browser',
      status: 'warn',
      message: 'Browser detection unavailable'
    });
    spinner.warn('Browser detection skipped');
  }

  // Display Results
  console.log();
  console.log(chalk.cyan('Diagnostic Results:\n'));

  const resultTable = new Table({
    head: ['Check', 'Status', 'Details'],
    style: { head: ['cyan'] },
    colWidths: [20, 10, 45]
  });

  let hasFailures = false;
  let hasWarnings = false;

  for (const result of results) {
    const statusIcon = result.status === 'pass'
      ? chalk.green('✓ PASS')
      : result.status === 'warn'
      ? chalk.yellow('⚠ WARN')
      : chalk.red('✗ FAIL');

    resultTable.push([result.name, statusIcon, result.message]);

    if (result.status === 'fail') hasFailures = true;
    if (result.status === 'warn') hasWarnings = true;
  }

  console.log(resultTable.toString());
  console.log();

  // Summary
  if (hasFailures) {
    console.log(chalk.red('✗ Diagnostics completed with failures'));
    console.log(chalk.yellow('\nPlease address the failures above before using the CLI'));
    process.exit(1);
  } else if (hasWarnings) {
    console.log(chalk.yellow('⚠ Diagnostics completed with warnings'));
    console.log(chalk.dim('\nThe CLI should work but some features may be limited'));
    process.exit(0);
  } else {
    console.log(chalk.green('✓ All diagnostics passed!'));
    console.log(chalk.dim('\nThe CLI is ready to use'));
    process.exit(0);
  }
}

async function checkTLS(hostname: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(port, hostname, {
      servername: hostname,
      rejectUnauthorized: true
    }, () => {
      const cert = socket.getPeerCertificate();

      if (socket.authorized) {
        socket.end();
        resolve();
      } else {
        socket.end();
        reject(new Error('Certificate not authorized'));
      }
    });

    socket.on('error', (error) => {
      reject(error);
    });

    socket.setTimeout(5000, () => {
      socket.end();
      reject(new Error('TLS connection timeout'));
    });
  });
}