import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadConfig, validateConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logSuccess, logWarning, formatNumber } from '../lib/utils';
import { ApiError } from '../types';

interface ClearOptions {
  all?: boolean;
  olderThan?: string;
}

export async function clearCommand(options: ClearOptions): Promise<void> {
  const config = loadConfig();

  // Validate configuration
  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    logError('Configuration is invalid. Run `cachegpt init` first.');
    validationErrors.forEach(error => console.log(chalk.red('  - ' + error)));
    return;
  }

  const apiClient = createApiClient(config as any);

  try {
    let olderThanHours: number;

    if (options.all) {
      // Clear all cache entries
      console.log(chalk.red('⚠️  WARNING: This will clear ALL cache entries!'));
      console.log('This action cannot be undone and will affect cache performance.');

      const confirmAll = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Are you sure you want to clear ALL cache entries?',
          default: false
        }
      ]);

      if (!confirmAll.proceed) {
        console.log(chalk.blue('Cache clearing cancelled.'));
        return;
      }

      // Set to a very large number to clear everything
      olderThanHours = 8760; // 1 year
    } else {
      // Clear entries older than specified hours
      const hours = options.olderThan ? parseFloat(options.olderThan) : 24;

      if (isNaN(hours) || hours < 0) {
        logError('Invalid hours value. Must be a positive number.');
        return;
      }

      olderThanHours = hours;

      if (hours < 1) {
        logWarning('Clearing cache entries less than 1 hour old may impact performance.');

        const confirmRecent = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: `Clear cache entries older than ${hours} hours?`,
            default: false
          }
        ]);

        if (!confirmRecent.proceed) {
          console.log(chalk.blue('Cache clearing cancelled.'));
          return;
        }
      }
    }

    const spinner = ora(`Clearing cache entries older than ${olderThanHours} hours...`).start();

    const result = await apiClient.clearCache({ olderThanHours });

    spinner.succeed('Cache clearing completed');

    console.log('\n' + chalk.bold('🗑️  Cache Clearing Results:'));
    console.log('═'.repeat(50));
    console.log(`Entries cleared: ${chalk.green(formatNumber(result.deleted_count || 0))}`);

    if (result.deleted_count > 0) {
      console.log(`Time threshold: ${chalk.blue(olderThanHours + ' hours')}`);
      logSuccess('Cache entries have been successfully cleared');

      console.log(chalk.blue('\n💡 What happens next:'));
      console.log('   • Subsequent requests will need to be processed fresh');
      console.log('   • New cache entries will be created as requests come in');
      console.log('   • Performance may be temporarily slower until cache rebuilds');
    } else {
      console.log(chalk.yellow('No cache entries were found matching the criteria.'));

      if (options.all) {
        console.log('The cache appears to be empty already.');
      } else {
        console.log(`No entries older than ${olderThanHours} hours found.`);
        console.log('You might want to try a smaller time threshold.');
      }
    }

    // Show statistics about what remains
    try {
      const stats = await apiClient.getStats(7);
      if (stats.totalRequests > 0) {
        console.log('\n' + chalk.bold('📊 Current Cache Status:'));
        console.log(`Total requests (last 7 days): ${formatNumber(stats.totalRequests)}`);
        console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
      }
    } catch (statsError) {
      // Stats might not be available, ignore the error
    }

  } catch (error: any) {
    const apiError = error as ApiError;
    if (apiError.error && apiError.message) {
      logError(apiError.error + ': ' + apiError.message);

      if (apiError.message.includes('permission') || apiError.message.includes('unauthorized')) {
        console.log(chalk.yellow('\n🔧 This operation requires admin permissions.'));
        console.log('Make sure your API key has administrative access.');
      }
    } else {
      logError('Failed to clear cache:', error.message || error);
    }

    console.log(chalk.blue('\n🔧 Troubleshooting:'));
    console.log('   1. Verify your API key has admin/write permissions');
    console.log('   2. Check that the clear endpoint is enabled on your server');
    console.log('   3. Ensure the server is running and accessible');
  }
}