import chalk from 'chalk';
import inquirer from 'inquirer';
import { table } from 'table';
import { loadConfig, saveConfig, validateConfig, getConfigPath, configExists } from '../lib/config';
import { logError, logSuccess, logInfo, isValidUrl } from '../lib/utils';
import { Config } from '../types';

interface ConfigOptions {
  show?: boolean;
  set?: string;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  try {
    if (options.show) {
      await showConfig();
    } else if (options.set) {
      await setConfigValue(options.set);
    } else {
      await manageConfig();
    }
  } catch (error: any) {
    logError('Configuration management failed:', error);
  }
}

async function showConfig(): Promise<void> {
  const config = loadConfig();

  console.log('\n' + chalk.bold('⚙️  Current Configuration:'));
  console.log('═'.repeat(50));

  if (!configExists()) {
    console.log(chalk.yellow('No configuration file found.'));
    console.log('Run `cachegpt init` to create a new configuration.');
    return;
  }

  const configData = [
    [chalk.bold('Setting'), chalk.bold('Value'), chalk.bold('Status')],
    [
      'Base URL',
      config.baseUrl || chalk.gray('not set'),
      config.baseUrl ? chalk.green('✓') : chalk.red('✗')
    ],
    [
      'API Key',
      config.apiKey ? maskApiKey(config.apiKey) : chalk.gray('not set'),
      config.apiKey ? chalk.green('✓') : chalk.red('✗')
    ],
    [
      'Default Model',
      config.defaultModel || chalk.gray('not set'),
      config.defaultModel ? chalk.green('✓') : chalk.yellow('?')
    ],
    [
      'Timeout',
      config.timeout ? `${config.timeout}s` : chalk.gray('not set'),
      config.timeout ? chalk.green('✓') : chalk.yellow('?')
    ]
  ];

  console.log(table(configData));

  console.log(`\nConfiguration file: ${chalk.blue(getConfigPath())}`);

  // Validate configuration
  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    console.log('\n' + chalk.red('❌ Configuration Issues:'));
    validationErrors.forEach(error => console.log(chalk.red('  • ' + error)));
    console.log('\nRun `cachegpt init` or `cachegpt config` to fix these issues.');
  } else {
    logSuccess('Configuration is valid');
  }
}

async function setConfigValue(keyValue: string): Promise<void> {
  const [key, ...valueParts] = keyValue.split('=');
  const value = valueParts.join('=');

  if (!key || value === undefined) {
    logError('Invalid format. Use: --set key=value');
    console.log('Available keys: baseUrl, apiKey, defaultModel, timeout');
    return;
  }

  const config = loadConfig();
  const newConfig = { ...config } as Config;

  switch (key.toLowerCase()) {
    case 'baseurl':
    case 'base_url':
      if (!isValidUrl(value)) {
        logError('Base URL must be a valid URL');
        return;
      }
      newConfig.baseUrl = value.replace(/\/$/, ''); // Remove trailing slash
      break;

    case 'apikey':
    case 'api_key':
      if (!value.startsWith('sk-')) {
        logError('API key should start with "sk-"');
        return;
      }
      newConfig.apiKey = value;
      break;

    case 'defaultmodel':
    case 'default_model':
      if (!value.trim()) {
        logError('Default model cannot be empty');
        return;
      }
      newConfig.defaultModel = value;
      break;

    case 'timeout':
      const timeout = parseInt(value, 10);
      if (isNaN(timeout) || timeout < 1 || timeout > 300) {
        logError('Timeout must be a number between 1 and 300 seconds');
        return;
      }
      newConfig.timeout = timeout;
      break;

    default:
      logError(`Unknown configuration key: ${key}`);
      console.log('Available keys: baseUrl, apiKey, defaultModel, timeout');
      return;
  }

  // Validate the updated configuration
  const validationErrors = validateConfig(newConfig);
  if (validationErrors.length > 0) {
    logError('Updated configuration would be invalid:');
    validationErrors.forEach(error => console.log(chalk.red('  • ' + error)));
    return;
  }

  // Save the configuration
  saveConfig(newConfig);
  logSuccess(`Configuration updated: ${key} = ${key.toLowerCase().includes('apikey') ? maskApiKey(value) : value}`);
}

async function manageConfig(): Promise<void> {
  const config = loadConfig();

  if (!configExists()) {
    console.log(chalk.yellow('No configuration found.'));
    const shouldInit = await inquirer.prompt({
        type: 'confirm',
        name: 'init',
        message: 'Would you like to initialize a new configuration?',
        default: true
      });

    if (shouldInit.init) {
      // Import and run init command
      const { initCommand } = await import('./init');
      await initCommand();
    }
    return;
  }

  console.log('\n' + chalk.bold('⚙️  Configuration Management'));
  console.log('═'.repeat(50));

  const action = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'View current configuration', value: 'view' },
        { name: 'Edit configuration values', value: 'edit' },
        { name: 'Reset configuration (reinitialize)', value: 'reset' },
        { name: 'Validate configuration', value: 'validate' },
        { name: 'Exit', value: 'exit' }
      ]
    });

  switch (action.action) {
    case 'view':
      await showConfig();
      break;

    case 'edit':
      await editConfiguration(config);
      break;

    case 'reset':
      const confirmReset = await inquirer.prompt({
          type: 'confirm',
          name: 'confirm',
          message: 'This will delete your current configuration. Continue?',
          default: false
        });

      if (confirmReset.confirm) {
        const { initCommand } = await import('./init');
        await initCommand();
      }
      break;

    case 'validate':
      const validationErrors = validateConfig(config);
      if (validationErrors.length > 0) {
        console.log('\n' + chalk.red('❌ Configuration Issues:'));
        validationErrors.forEach(error => console.log(chalk.red('  • ' + error)));
      } else {
        logSuccess('Configuration is valid');
      }
      break;

    case 'exit':
      logInfo('Configuration management cancelled');
      break;
  }
}

async function editConfiguration(currentConfig: Partial<Config>): Promise<void> {
  const baseUrlAnswer = await inquirer.prompt({
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL:',
      default: currentConfig.baseUrl,
      validate: (input: string) => {
        if (!input.trim()) return 'Base URL is required';
        if (!isValidUrl(input)) return 'Must be a valid URL';
        return true;
      },
      filter: (input: string) => input.trim().replace(/\/$/, '')
    });

  const apiKeyAnswer = await inquirer.prompt({
      type: 'input',
      name: 'apiKey',
      message: 'API Key:',
      default: currentConfig.apiKey,
      validate: (input: string) => {
        if (!input.trim()) return 'API key is required';
        if (!input.startsWith('sk-')) return 'API key should start with "sk-"';
        return true;
      }
    });

  const defaultModelAnswer = await inquirer.prompt({
      type: 'input',
      name: 'defaultModel',
      message: 'Default Model:',
      default: currentConfig.defaultModel || 'gpt-3.5-turbo',
      validate: (input: string) => input.trim() ? true : 'Default model is required'
    });

  const timeoutAnswer = await inquirer.prompt({
      type: 'number',
      name: 'timeout',
      message: 'Timeout (seconds):',
      default: currentConfig.timeout || 30,
      validate: (input: number | undefined) => {
        if (!input || input < 1 || input > 300) return 'Timeout must be between 1 and 300 seconds';
        return true;
      }
    });

  const fields = { ...baseUrlAnswer, ...apiKeyAnswer, ...defaultModelAnswer, ...timeoutAnswer };

  const newConfig: Config = {
    baseUrl: fields.baseUrl,
    apiKey: fields.apiKey,
    defaultModel: fields.defaultModel,
    timeout: fields.timeout
  };

  // Validate the new configuration
  const validationErrors = validateConfig(newConfig);
  if (validationErrors.length > 0) {
    logError('Configuration is invalid:');
    validationErrors.forEach(error => console.log(chalk.red('  • ' + error)));
    return;
  }

  // Save the configuration
  saveConfig(newConfig);
  logSuccess('Configuration updated successfully');
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return apiKey;
  }
  return apiKey.substring(0, 6) + '•'.repeat(8) + apiKey.substring(apiKey.length - 4);
}