import chalk from 'chalk';
import inquirer from 'inquirer';
import { ModelValidator, ModelValidationResult } from '../lib/model-validator';
import { TokenManager } from '../lib/token-manager';
import { logError, logSuccess } from '../lib/utils';

/**
 * Model management command - validate, update, and display available models
 */
export async function modelsCommand(action?: string): Promise<void> {
  if (!action) {
    // Show help if no action specified
    displayHelp();
    return;
  }

  switch (action) {
    case 'list':
      await listModels();
      break;
    case 'validate':
      await validateModels();
      break;
    case 'update':
      await updateModels();
      break;
    case 'check':
      await checkModelAccess();
      break;
    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      displayHelp();
  }
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(chalk.cyan.bold('\n📋 CacheGPT Model Management\n'));

  const commands = [
    { cmd: 'cachegpt models list', desc: 'List all configured models' },
    { cmd: 'cachegpt models validate', desc: 'Validate model availability with API keys' },
    { cmd: 'cachegpt models update', desc: 'Update model configuration' },
    { cmd: 'cachegpt models check', desc: 'Quick check of current model access' }
  ];

  commands.forEach(({ cmd, desc }) => {
    console.log(chalk.white(`  ${cmd.padEnd(30)} ${chalk.gray(desc)}`));
  });

  console.log();
}

/**
 * List all configured models
 */
async function listModels(): Promise<void> {
  console.log(chalk.cyan.bold('📋 Available Models\n'));

  try {
    const fs = await import('fs');
    const path = await import('path');

    const configPath = path.join(__dirname, '../../../config/llm-models.json');

    if (!fs.existsSync(configPath)) {
      console.log(chalk.red('No model configuration found. Run "cachegpt models update" first.'));
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    console.log(chalk.gray(`Last updated: ${config.lastUpdated || 'Unknown'}\n`));

    for (const [providerId, providerData] of Object.entries(config.providers)) {
      const provider = providerData as any;
      console.log(chalk.bold(`${provider.name} (${providerId}):`));

      for (const model of provider.models) {
        const defaultMark = model.default ? chalk.green(' (default)') : '';
        const tokenInfo = model.maxTokens ? chalk.gray(` - ${model.maxTokens.toLocaleString()} tokens`) : '';

        console.log(chalk.white(`  • ${model.name}${defaultMark}${tokenInfo}`));
        console.log(chalk.gray(`    ID: ${model.id}`));
      }
      console.log();
    }

  } catch (error: any) {
    logError('Failed to list models:', error);
  }
}

/**
 * Validate models with actual API calls
 */
async function validateModels(): Promise<void> {
  console.log(chalk.cyan.bold('🔍 Validating Model Access\n'));
  console.log(chalk.yellow('This will test your API keys against actual provider APIs.\n'));

  // Get API keys from TokenManager
  const tokenManager = new TokenManager();
  const apiKeys: Record<string, string> = {};

  const providers = ['openai', 'anthropic', 'google', 'perplexity'];
  let hasAnyKey = false;

  for (const provider of providers) {
    try {
      const providerKey = mapProviderName(provider);
      const token = tokenManager.getAPIKey(providerKey);
      apiKeys[provider] = token.value;
      hasAnyKey = true;
      console.log(chalk.green(`✅ Found API key for ${provider}`));
    } catch (error) {
      console.log(chalk.gray(`⏭️  No API key for ${provider}`));
    }
  }

  if (!hasAnyKey) {
    console.log(chalk.red('\n❌ No API keys found!'));
    console.log(chalk.yellow('Please run "cachegpt init" to set up authentication first.\n'));
    return;
  }

  console.log();

  // Run validation
  const validator = new ModelValidator();
  const results = await validator.validateAllModels(apiKeys);

  // Display results
  validator.displayResults(results);

  // Ask if user wants to update config
  const { updateConfig } = await inquirer.prompt({
    type: 'confirm',
    name: 'updateConfig',
    message: 'Update model configuration with these results?',
    default: true
  });

  if (updateConfig) {
    await validator.updateConfigFile(results);
    logSuccess('Model configuration updated');
  }
}

/**
 * Update model configuration
 */
async function updateModels(): Promise<void> {
  console.log(chalk.cyan.bold('🔄 Updating Model Configuration\n'));

  const { source } = await inquirer.prompt({
    type: 'list',
    name: 'source',
    message: 'How would you like to update models?',
    choices: [
      { name: '🌐 Download from CacheGPT (recommended)', value: 'download' },
      { name: '🔍 Validate with your API keys', value: 'validate' },
      { name: '📝 Manual update', value: 'manual' }
    ]
  });

  switch (source) {
    case 'download':
      await downloadModelConfig();
      break;
    case 'validate':
      await validateModels();
      break;
    case 'manual':
      await manualUpdate();
      break;
  }
}

/**
 * Download latest model config from CacheGPT
 */
async function downloadModelConfig(): Promise<void> {
  try {
    console.log(chalk.gray('Downloading latest model configuration...'));

    const response = await fetch('https://cachegpt.app/api/model-updates');

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const config = await response.json();

    const fs = await import('fs');
    const path = await import('path');

    const configPath = path.join(__dirname, '../../../config/llm-models.json');
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(chalk.green('\n✅ Downloaded latest model configuration'));
    console.log(chalk.gray(`Updated: ${config.lastUpdated || 'today'}`));

    logSuccess('Model configuration updated from CacheGPT');

  } catch (error: any) {
    console.log(chalk.red('\n❌ Failed to download model configuration'));
    console.log(chalk.yellow('Falling back to manual validation...'));

    await validateModels();
  }
}

/**
 * Manual model configuration update
 */
async function manualUpdate(): Promise<void> {
  console.log(chalk.yellow('Manual update not implemented yet.'));
  console.log(chalk.gray('Use "cachegpt models validate" to update from your API keys.'));
}

/**
 * Quick check of current model access
 */
async function checkModelAccess(): Promise<void> {
  console.log(chalk.cyan.bold('⚡ Quick Model Access Check\n'));

  const tokenManager = new TokenManager();
  const providers = ['claude', 'chatgpt', 'gemini', 'perplexity'];

  for (const provider of providers) {
    const methods = tokenManager.getAvailableAuthMethods(provider);

    if (methods.webSession) {
      console.log(chalk.green(`✅ ${provider}: Web session available`));
    } else if (methods.apiKey) {
      console.log(chalk.green(`✅ ${provider}: API key available`));
    } else {
      console.log(chalk.gray(`⏭️  ${provider}: No authentication`));
    }
  }

  console.log();
  console.log(chalk.gray('Run "cachegpt models validate" for detailed API testing.'));
}

/**
 * Map provider name to TokenManager format
 */
function mapProviderName(provider: string): 'openai' | 'anthropic' | 'google' | 'perplexity' {
  switch (provider) {
    case 'openai':
    case 'chatgpt':
      return 'openai';
    case 'anthropic':
    case 'claude':
      return 'anthropic';
    case 'google':
    case 'gemini':
      return 'google';
    case 'perplexity':
      return 'perplexity';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}