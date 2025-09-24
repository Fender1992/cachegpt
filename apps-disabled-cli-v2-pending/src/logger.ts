import chalk from 'chalk';
import { Logger } from '@cachegpt/auth-sdk';
import { redactSecrets } from '@cachegpt/auth-sdk';

export function createLogger(verbose?: boolean): Logger {
  return {
    debug: (message: string, ...args: any[]) => {
      if (verbose || process.env.DEBUG) {
        console.log(chalk.gray('[DEBUG]'), redactSecrets(message), ...args.map(arg =>
          typeof arg === 'string' ? redactSecrets(arg) : arg
        ));
      }
    },
    info: (message: string, ...args: any[]) => {
      if (verbose || process.env.DEBUG) {
        console.log(chalk.blue('[INFO]'), redactSecrets(message), ...args.map(arg =>
          typeof arg === 'string' ? redactSecrets(arg) : arg
        ));
      }
    },
    warn: (message: string, ...args: any[]) => {
      console.log(chalk.yellow('[WARN]'), redactSecrets(message), ...args.map(arg =>
        typeof arg === 'string' ? redactSecrets(arg) : arg
      ));
    },
    error: (message: string, ...args: any[]) => {
      console.error(chalk.red('[ERROR]'), redactSecrets(message), ...args.map(arg =>
        typeof arg === 'string' ? redactSecrets(arg) : arg
      ));
    }
  };
}