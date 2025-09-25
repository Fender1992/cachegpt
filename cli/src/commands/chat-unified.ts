import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createInterface } from 'readline';
import { TokenManager, AuthToken } from '../lib/token-manager';
import { logError } from '../lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AuthConfig {
  provider: string;
  authMethod: 'web-session' | 'api-key';
  credential: string;
  model: string;
}

export async function chatUnifiedCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║         CacheGPT Chat Interface 💬           ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
  console.log();

  try {
    // Load authentication using TokenManager
    const tokenManager = new TokenManager();
    const authConfig = await loadOrCreateAuth(tokenManager);

    if (!authConfig) {
      console.log(chalk.red('❌ No authentication found. Please run "cachegpt init" first.'));
      return;
    }

    console.log(chalk.green(`✅ Connected to ${authConfig.provider}`));
    console.log(chalk.gray(`Using ${authConfig.authMethod === 'web-session' ? 'web session' : 'API key'} authentication`));
    console.log(chalk.gray(`Model: ${authConfig.model}\n`));

    // Start chat session
    await startChatLoop(authConfig);

  } catch (error: any) {
    logError('Chat failed:', error);
    process.exit(1);
  }
}

/**
 * Load existing auth or prompt to create new
 */
async function loadOrCreateAuth(tokenManager: TokenManager): Promise<AuthConfig | null> {
  // Get available providers from token manager
  const availableProviders = ['claude', 'chatgpt', 'gemini', 'perplexity'].filter(provider => {
    const methods = tokenManager.getAvailableAuthMethods(provider);
    return methods.webSession || methods.apiKey;
  });

  if (availableProviders.length === 0) {
    return await promptForNewAuth(tokenManager);
  }

  // If multiple providers configured, ask which to use
  if (availableProviders.length > 1) {
    const choices = availableProviders.map(provider => ({
      name: getProviderName(provider),
      value: provider
    }));

    const { selectedProvider } = await inquirer.prompt({
      type: 'list',
      name: 'selectedProvider',
      message: 'Which provider would you like to use?',
      choices
    });

    return loadAuthConfig(tokenManager, selectedProvider);
  }

  // Single provider - use it
  return loadAuthConfig(tokenManager, availableProviders[0]);
}

/**
 * Prompt for new authentication
 */
async function promptForNewAuth(tokenManager: TokenManager): Promise<AuthConfig | null> {
  console.log(chalk.yellow('🔐 No authentication found'));

  const { setupNow } = await inquirer.prompt({
    type: 'confirm',
    name: 'setupNow',
    message: 'Would you like to set up authentication now?',
    default: true
  });

  if (!setupNow) {
    return null;
  }

  // Run init flow
  const { initUnifiedCommand } = await import('./init-unified');
  await initUnifiedCommand();

  // Try to load the newly created auth
  const availableProviders = ['claude', 'chatgpt', 'gemini', 'perplexity'].filter(provider => {
    const methods = tokenManager.getAvailableAuthMethods(provider);
    return methods.webSession || methods.apiKey;
  });

  if (availableProviders.length > 0) {
    return loadAuthConfig(tokenManager, availableProviders[0]);
  }

  return null;
}

/**
 * Load auth configuration for a provider
 */
function loadAuthConfig(tokenManager: TokenManager, provider: string): AuthConfig | null {
  try {
    // Use TokenManager to get credentials (prefers web session, falls back to API key)
    const token = tokenManager.getCredentialForProvider(provider, true);

    return {
      provider,
      authMethod: token.type.includes('web') ? 'web-session' : 'api-key',
      credential: token.value,
      model: getDefaultModel(provider)
    };
  } catch (error) {
    console.error(`Error loading auth for ${provider}:`, error);
    return null;
  }
}

/**
 * Main chat loop
 */
async function startChatLoop(authConfig: AuthConfig): Promise<void> {
  const messages: ChatMessage[] = [];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.cyan('💬 Start typing to chat. Type "exit" to quit.\n'));

  const prompt = () => {
    rl.question(chalk.green('You: '), async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log(chalk.yellow('\n👋 Goodbye!\n'));
        rl.close();
        process.exit(0);
      }

      if (input.trim() === '') {
        prompt();
        return;
      }

      // Add user message
      messages.push({
        role: 'user',
        content: input,
        timestamp: new Date()
      });

      // Get AI response
      const spinner = ora('Thinking...').start();

      try {
        const response = await callUnifiedAPI(authConfig, messages);
        spinner.stop();

        // Add assistant response
        messages.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });

        // Display response
        console.log(chalk.blue('\nAssistant: ') + response + '\n');

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red('\n❌ Error: ') + error.message + '\n');
      }

      prompt();
    });
  };

  prompt();
}

/**
 * Call the unified API with the appropriate authentication
 */
async function callUnifiedAPI(authConfig: AuthConfig, messages: ChatMessage[]): Promise<string> {
  const apiUrl = process.env.CACHEGPT_API_URL || 'https://cachegpt.app';

  const response = await fetch(`${apiUrl}/api/v2/unified-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: authConfig.provider,
      model: authConfig.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      authMethod: authConfig.authMethod,
      credential: authConfig.credential
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Get provider display name
 */
function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    claude: '🤖 Claude',
    chatgpt: '💬 ChatGPT',
    gemini: '✨ Gemini',
    perplexity: '🔍 Perplexity'
  };
  return names[provider] || provider;
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider: string): string {
  const models: Record<string, string> = {
    claude: 'claude-opus-4-1-20250805',
    chatgpt: 'gpt-5',
    gemini: 'gemini-2.0-ultra',
    perplexity: 'pplx-pro-online'
  };
  return models[provider] || 'default';
}