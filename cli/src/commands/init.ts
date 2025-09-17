import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveConfig, validateConfig } from '../lib/config';
import { createApiClient } from '../lib/api';
import { logError, logSuccess, logInfo, isValidUrl } from '../lib/utils';
import { Config } from '../types';

const LLM_PROVIDERS = {
  openai: {
    name: 'OpenAI (GPT-3.5, GPT-4)',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'],
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
    apiUrl: 'https://api.openai.com',
    instructions: 'Get your API key from OpenAI Platform'
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-2.1'],
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    apiUrl: 'https://api.anthropic.com',
    instructions: 'Get your API key from Anthropic Console'
  },
  google: {
    name: 'Google (Gemini)',
    models: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    keyPrefix: 'AIza',
    keyUrl: 'https://makersuite.google.com/app/apikey',
    apiUrl: 'https://generativelanguage.googleapis.com',
    instructions: 'Get your API key from Google AI Studio'
  },
  custom: {
    name: 'Custom/Self-hosted',
    models: [],
    keyPrefix: '',
    keyUrl: '',
    apiUrl: '',
    instructions: 'Use your own LLM endpoint'
  }
};

export async function initCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║      Welcome to CacheGPT CLI Setup! 🚀      ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('This wizard will help you connect CacheGPT to your LLM provider.'));
  console.log(chalk.gray('CacheGPT acts as a caching proxy to reduce API costs by up to 80%.\n'));

  try {
    // Step 1: Choose deployment type
    const deploymentAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'deployment',
        message: 'How is your CacheGPT server deployed?',
        choices: [
          {
            name: '🏠 Local (running on this machine)',
            value: 'local'
          },
          {
            name: '☁️  Cloud (hosted on a remote server)',
            value: 'cloud'
          },
          {
            name: '🚀 Not deployed yet (I need help setting it up)',
            value: 'setup'
          }
        ]
      }
    ]);

    if (deploymentAnswer.deployment === 'setup') {
      console.log();
      console.log(chalk.yellow('📚 Setup Instructions:'));
      console.log(chalk.white('1. Clone the repository: ') + chalk.cyan('git clone https://github.com/Fender1992/cachegpt.git'));
      console.log(chalk.white('2. Install dependencies: ') + chalk.cyan('cd cachegpt && npm install'));
      console.log(chalk.white('3. Set up environment: ') + chalk.cyan('cp .env.example .env'));
      console.log(chalk.white('4. Start the server: ') + chalk.cyan('npm run dev'));
      console.log();
      console.log(chalk.gray('Once your server is running, run this command again.'));
      return;
    }

    // Step 2: Get server URL
    let baseUrl = 'http://localhost:8000';
    if (deploymentAnswer.deployment === 'cloud') {
      const urlAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Enter your CacheGPT server URL:',
          default: 'https://your-server.com',
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Server URL is required';
            }
            if (!isValidUrl(input)) {
              return 'Please enter a valid URL (including http:// or https://)';
            }
            return true;
          },
          filter: (input: string) => input.trim().replace(/\/$/, '')
        }
      ]);
      baseUrl = urlAnswer.baseUrl;
    }

    // Step 3: Choose LLM provider
    const providerAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Which LLM provider do you want to use?',
        choices: Object.entries(LLM_PROVIDERS).map(([key, provider]) => ({
          name: provider.name,
          value: key
        }))
      }
    ]);

    const selectedProvider = LLM_PROVIDERS[providerAnswer.provider as keyof typeof LLM_PROVIDERS];

    // Step 4: Get API key
    console.log();
    if (selectedProvider.keyUrl) {
      console.log(chalk.yellow('📋 ' + selectedProvider.instructions));
      console.log(chalk.blue('🔗 Get your key here: ') + chalk.underline(selectedProvider.keyUrl));
      console.log();

      const openBrowser = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'open',
          message: 'Would you like to open this URL in your browser?',
          default: true
        }
      ]);

      if (openBrowser.open) {
        const open = await import('open').catch(() => null);
        if (open) {
          await open.default(selectedProvider.keyUrl);
          console.log(chalk.green('✅ Browser opened. Please copy your API key.'));
        }
      }
    }

    const apiKeyAnswer = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter your ${selectedProvider.name} API key:`,
        mask: '*',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'API key is required';
          }
          if (selectedProvider.keyPrefix && !input.startsWith(selectedProvider.keyPrefix)) {
            return `API key should start with "${selectedProvider.keyPrefix}"`;
          }
          if (input.length < 10) {
            return 'API key seems too short';
          }
          return true;
        }
      }
    ]);

    // Step 5: Choose model
    let defaultModel = 'gpt-3.5-turbo';
    if (selectedProvider.models.length > 0) {
      const modelAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'model',
          message: 'Select your preferred model:',
          choices: selectedProvider.models.map(model => ({
            name: model,
            value: model
          }))
        }
      ]);
      defaultModel = modelAnswer.model;
    } else if (providerAnswer.provider === 'custom') {
      const customModelAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'model',
          message: 'Enter your model name:',
          default: 'gpt-3.5-turbo'
        }
      ]);
      defaultModel = customModelAnswer.model;
    }

    // Step 6: Advanced settings
    const advancedAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'advanced',
        message: 'Configure advanced settings?',
        default: false
      }
    ]);

    let timeout = 30;
    if (advancedAnswer.advanced) {
      const advancedSettings = await inquirer.prompt([
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
      timeout = advancedSettings.timeout;
    }

    const config: Config = {
      baseUrl,
      apiKey: apiKeyAnswer.apiKey,
      defaultModel,
      timeout
    };

    // Test the connection
    console.log();
    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const loadingInterval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(spinner[i++ % spinner.length])} Testing connection to CacheGPT server...`);
    }, 100);

    try {
      const apiClient = createApiClient(config);
      const health = await apiClient.healthCheck();
      clearInterval(loadingInterval);
      process.stdout.write('\r');

      if (health.status === 'healthy') {
        console.log(chalk.green('✅ Connection successful!'));
        console.log(chalk.gray(`   Connected to: ${health.environment || 'production'} environment`));
      } else {
        console.log(chalk.yellow('⚠️  Server responded but may not be fully configured'));
      }
    } catch (error: any) {
      clearInterval(loadingInterval);
      process.stdout.write('\r');
      console.log(chalk.yellow('⚠️  Could not connect to CacheGPT server'));
      console.log(chalk.gray('   The server might not be running or accessible.'));

      const proceed = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: 'Save configuration anyway?',
          default: true
        }
      ]);

      if (!proceed.continue) {
        console.log(chalk.gray('\nConfiguration not saved. Run ') + chalk.cyan('llm-cache init') + chalk.gray(' to try again.'));
        return;
      }
    }

    // Save the configuration
    saveConfig(config);

    console.log();
    console.log(chalk.green('✅ Configuration saved successfully!'));
    console.log();
    console.log(chalk.cyan('📚 Quick Start Guide:'));
    console.log();
    console.log(chalk.white('  Test your setup:'));
    console.log(chalk.gray('  $ ') + chalk.cyan('llm-cache test'));
    console.log();
    console.log(chalk.white('  View cache statistics:'));
    console.log(chalk.gray('  $ ') + chalk.cyan('llm-cache stats'));
    console.log();
    console.log(chalk.white('  Clear old cache entries:'));
    console.log(chalk.gray('  $ ') + chalk.cyan('llm-cache clear --older-than 24'));
    console.log();
    console.log(chalk.white('  View all commands:'));
    console.log(chalk.gray('  $ ') + chalk.cyan('llm-cache --help'));
    console.log();
    console.log(chalk.gray('💡 Tip: Your API calls will now be automatically cached!'));
    console.log(chalk.gray('   Just point your application to: ') + chalk.cyan(baseUrl));

  } catch (error: any) {
    if (error.name === 'ExitPromptError') {
      console.log(chalk.gray('\nSetup cancelled.'));
      return;
    }
    logError('Failed to initialize configuration:', error);
  }
}