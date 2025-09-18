import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { saveConfig, getConfigPath } from '../lib/config';
import { logError, logSuccess } from '../lib/utils';

interface DirectConfig {
  mode: 'direct';
  providers: {
    openai?: string;
    anthropic?: string;
    google?: string;
    mistral?: string;
  };
  defaultModel: string;
  cacheEnabled: boolean;
  cacheLocation: string;
  temperature: number;
  maxTokens: number;
}

const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo-preview'],
    keyPrefix: 'sk-',
    envVar: 'OPENAI_API_KEY',
    url: 'https://platform.openai.com/api-keys'
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    keyPrefix: 'sk-ant-',
    envVar: 'ANTHROPIC_API_KEY',
    url: 'https://console.anthropic.com/settings/keys'
  },
  google: {
    name: 'Google (Gemini)',
    models: ['gemini-pro', 'gemini-1.5-pro'],
    keyPrefix: 'AIza',
    envVar: 'GOOGLE_API_KEY',
    url: 'https://makersuite.google.com/app/apikey'
  },
  mistral: {
    name: 'Mistral AI',
    models: ['mistral-tiny', 'mistral-small', 'mistral-medium'],
    keyPrefix: '',
    envVar: 'MISTRAL_API_KEY',
    url: 'https://console.mistral.ai/api-keys'
  }
};

export async function initDirectCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 CacheGPT CLI - Direct API Mode Setup\n'));
  console.log(chalk.white('Configure your LLM provider API keys for direct access with intelligent caching.\n'));

  try {
    const configPath = getConfigPath();

    // Check for existing config
    if (fs.existsSync(configPath)) {
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: chalk.yellow('⚠️  Configuration already exists. Overwrite?'),
        default: false
      }]);

      if (!overwrite) {
        console.log(chalk.gray('Setup cancelled.'));
        return;
      }
    }

    console.log(chalk.cyan('\n📝 Step 1: Configure API Keys'));
    console.log(chalk.gray('Enter your API keys for the providers you want to use.'));
    console.log(chalk.gray('Press Enter to skip any provider.\n'));

    const providers: any = {};

    // Collect API keys
    for (const [key, info] of Object.entries(PROVIDER_INFO)) {
      console.log(chalk.white(`\n${info.name}:`));
      if (info.url) {
        console.log(chalk.gray(`Get your key at: ${chalk.underline(info.url)}`));
      }

      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `API Key${info.keyPrefix ? ` (${info.keyPrefix}...)` : ''}:`,
        mask: '*',
        validate: (input: string) => {
          if (!input) return true; // Allow skipping
          if (info.keyPrefix && !input.startsWith(info.keyPrefix)) {
            return `Key should start with "${info.keyPrefix}"`;
          }
          if (input.length < 20) {
            return 'API key seems too short';
          }
          return true;
        }
      }]);

      if (apiKey) {
        providers[key] = apiKey;
        console.log(chalk.green(`✓ ${info.name} configured`));
      }
    }

    // Check if at least one provider is configured
    if (Object.keys(providers).length === 0) {
      console.log(chalk.red('\n❌ At least one API key is required!'));
      console.log(chalk.gray('Please run the setup again and provide at least one API key.'));
      process.exit(1);
    }

    // Select default model
    console.log(chalk.cyan('\n📋 Step 2: Select Default Model'));

    const modelChoices: any[] = [];
    for (const [provider, apiKey] of Object.entries(providers)) {
      if (apiKey) {
        const info = PROVIDER_INFO[provider as keyof typeof PROVIDER_INFO];
        info.models.forEach(model => {
          modelChoices.push({
            name: `${model} (${info.name})`,
            value: model
          });
        });
      }
    }

    const { defaultModel } = await inquirer.prompt([{
      type: 'list',
      name: 'defaultModel',
      message: 'Select your default model:',
      choices: modelChoices
    }]);

    // Cache settings
    console.log(chalk.cyan('\n💾 Step 3: Cache Configuration'));

    const { cacheEnabled } = await inquirer.prompt([{
      type: 'confirm',
      name: 'cacheEnabled',
      message: 'Enable intelligent response caching?',
      default: true
    }]);

    const cacheLocation = path.join(os.homedir(), '.cachegpt', 'cache');

    // Advanced settings
    const { advanced } = await inquirer.prompt([{
      type: 'confirm',
      name: 'advanced',
      message: 'Configure advanced settings?',
      default: false
    }]);

    let temperature = 0.7;
    let maxTokens = 2048;

    if (advanced) {
      const advancedAnswers = await inquirer.prompt([
        {
          type: 'number',
          name: 'temperature',
          message: 'Default temperature (0.0 - 2.0):',
          default: 0.7,
          validate: (input: number) => {
            if (input < 0 || input > 2) {
              return 'Temperature must be between 0 and 2';
            }
            return true;
          }
        },
        {
          type: 'number',
          name: 'maxTokens',
          message: 'Default max tokens:',
          default: 2048,
          validate: (input: number) => {
            if (input < 1 || input > 32000) {
              return 'Max tokens must be between 1 and 32000';
            }
            return true;
          }
        }
      ]);
      temperature = advancedAnswers.temperature;
      maxTokens = advancedAnswers.maxTokens;
    }

    // Build configuration
    const config: DirectConfig = {
      mode: 'direct',
      providers,
      defaultModel,
      cacheEnabled,
      cacheLocation,
      temperature,
      maxTokens
    };

    // Create necessary directories
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (cacheEnabled && !fs.existsSync(cacheLocation)) {
      fs.mkdirSync(cacheLocation, { recursive: true });
    }

    // Save configuration with encryption for API keys
    const encryptedConfig = {
      ...config,
      providers: encryptProviders(providers)
    };

    fs.writeFileSync(configPath, JSON.stringify(encryptedConfig, null, 2));

    // Success message
    console.log(chalk.green.bold('\n✅ Configuration saved successfully!\n'));

    // Display quick start guide
    displayQuickStart(config);

  } catch (error: any) {
    if (error.name === 'ExitPromptError') {
      console.log(chalk.gray('\nSetup cancelled.'));
      return;
    }
    logError('Failed to initialize configuration:', error);
  }
}

function encryptProviders(providers: any): any {
  const encrypted: any = {};
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(os.hostname(), 'salt', 32);

  for (const [provider, apiKey] of Object.entries(providers)) {
    if (apiKey) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encryptedKey = cipher.update(apiKey as string, 'utf8', 'hex');
      encryptedKey += cipher.final('hex');
      encrypted[provider] = {
        data: encryptedKey,
        iv: iv.toString('hex')
      };
    }
  }

  return encrypted;
}

function displayQuickStart(config: DirectConfig) {
  const box = (text: string) => {
    const lines = text.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const border = '═'.repeat(maxLength + 2);

    console.log(chalk.cyan(`╔${border}╗`));
    lines.forEach(line => {
      const padding = ' '.repeat(maxLength - line.length);
      console.log(chalk.cyan('║ ') + line + padding + chalk.cyan(' ║'));
    });
    console.log(chalk.cyan(`╚${border}╝`));
  };

  box('🎉 Quick Start Guide');
  console.log();

  const commands = [
    {
      title: '1. Test your configuration',
      command: 'cachegpt test',
      description: 'Verify API keys and connection'
    },
    {
      title: '2. Start interactive chat',
      command: 'cachegpt chat',
      description: 'Chat with AI using intelligent caching'
    },
    {
      title: '3. View usage statistics',
      command: 'cachegpt stats',
      description: 'See cache hits, cost savings, and usage'
    },
    {
      title: '4. Clear old cache',
      command: 'cachegpt clear',
      description: 'Remove outdated cache entries'
    }
  ];

  commands.forEach(({ title, command, description }) => {
    console.log(chalk.white.bold(title));
    console.log(chalk.cyan(`  $ ${command}`));
    console.log(chalk.gray(`  ${description}\n`));
  });

  console.log(chalk.yellow('💡 Tips:'));
  console.log(chalk.gray('  • Your API keys are securely encrypted and stored locally'));
  console.log(chalk.gray(`  • Cache is stored at: ${config.cacheLocation}`));
  console.log(chalk.gray('  • Use "cachegpt config" to modify settings'));
  console.log(chalk.gray('  • Run "cachegpt --help" for all available commands\n'));

  // Show configured providers
  console.log(chalk.green('✅ Configured Providers:'));
  Object.keys(config.providers).forEach(provider => {
    const info = PROVIDER_INFO[provider as keyof typeof PROVIDER_INFO];
    console.log(chalk.gray(`  • ${info.name}`));
  });
  console.log();

  if (config.cacheEnabled) {
    console.log(chalk.blue('🚀 Intelligent caching is enabled!'));
    console.log(chalk.gray('   Similar queries will be served from cache, saving API costs.\n'));
  }
}