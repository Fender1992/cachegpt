import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveConfig, validateConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logSuccess, logInfo, isValidUrl } from '../lib/utils';
import { Config } from '../types';

export async function initCommand(): Promise<void> {
  console.log(chalk.blue('🚀 Welcome to LLM Cache CLI Setup'));
  console.log('Let\'s configure your connection to the LLM Cache Proxy.\n');

  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Enter the base URL of your LLM Cache Proxy:',
        default: 'http://localhost:8000',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Base URL is required';
          }
          if (!isValidUrl(input)) {
            return 'Please enter a valid URL (including http:// or https://)';
          }
          return true;
        },
        filter: (input: string) => input.trim().replace(/\/$/, '') // Remove trailing slash
      },
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your API key:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'API key is required';
          }
          if (!input.startsWith('sk-')) {
            return 'API key should start with "sk-"';
          }
          if (input.length < 10) {
            return 'API key seems too short';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'defaultModel',
        message: 'Default LLM model to use:',
        default: 'gpt-3.5-turbo',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Default model is required';
          }
          return true;
        }
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Request timeout (seconds):',
        default: 30,
        validate: (input: number) => {
          if (input < 1 || input > 300) {
            return 'Timeout must be between 1 and 300 seconds';
          }
          return true;
        }
      }
    ]);

    const config: Config = {
      baseUrl: answers.baseUrl,
      apiKey: answers.apiKey,
      defaultModel: answers.defaultModel,
      timeout: answers.timeout
    };

    // Validate the configuration
    const validationErrors = validateConfig(config);
    if (validationErrors.length > 0) {
      logError('Configuration validation failed:');
      validationErrors.forEach(error => console.log(chalk.red('  - ' + error)));
      return;
    }

    // Test the connection
    logInfo('Testing connection to LLM Cache Proxy...');

    try {
      const apiClient = createApiClient(config);
      const health = await apiClient.healthCheck();

      if (health.status === 'healthy') {
        logSuccess('Connection test successful!');
        logInfo(`Connected to: ${health.environment || 'unknown'} environment`);
      } else {
        logError('API is not healthy', health);

        const proceed = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: 'API health check failed. Save configuration anyway?',
            default: false
          }
        ]);

        if (!proceed.continue) {
          logInfo('Configuration not saved.');
          return;
        }
      }
    } catch (error: any) {
      logError('Connection test failed:', error);

      const proceed = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: 'Connection test failed. Save configuration anyway?',
          default: false
        }
      ]);

      if (!proceed.continue) {
        logInfo('Configuration not saved.');
        return;
      }
    }

    // Save the configuration
    saveConfig(config);
    logSuccess('Configuration saved successfully!');
    console.log(chalk.blue('\nYou can now run the following commands:'));
    console.log(chalk.white('  llm-cache test    - Test cache functionality'));
    console.log(chalk.white('  llm-cache stats   - View cache statistics'));
    console.log(chalk.white('  llm-cache config  - Manage configuration'));
    console.log(chalk.blue('\nFor more help, run: llm-cache --help'));

  } catch (error: any) {
    if (error.name === 'ExitPromptError') {
      logInfo('Setup cancelled.');
      return;
    }
    logError('Failed to initialize configuration:', error);
  }
}