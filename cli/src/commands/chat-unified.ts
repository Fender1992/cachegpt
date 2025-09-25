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
    console.log(chalk.gray(`\n🔐 Loading authentication for ${provider}...`));

    // Use TokenManager to get credentials (prefers web session, falls back to API key)
    const token = tokenManager.getCredentialForProvider(provider, true);

    console.log(chalk.gray(`  Token type: ${token.type}`));
    console.log(chalk.gray(`  Token value length: ${token.value?.length || 0} chars`));
    console.log(chalk.gray(`  Token value preview: ${token.value?.substring(0, 30)}...`));

    const config: AuthConfig = {
      provider,
      authMethod: token.type.includes('web') ? 'web-session' : 'api-key' as 'web-session' | 'api-key',
      credential: token.value,
      model: getDefaultModel(provider)
    };

    console.log(chalk.gray(`  Auth method determined: ${config.authMethod}`));
    console.log(chalk.gray(`  Model: ${config.model}`));

    return config;
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

  console.log(chalk.gray('\n🔍 Debug: Authentication Config:'));
  console.log(chalk.gray(`  Provider: ${authConfig.provider}`));
  console.log(chalk.gray(`  Auth Method: ${authConfig.authMethod}`));
  console.log(chalk.gray(`  Credential Length: ${authConfig.credential?.length || 0} chars`));
  console.log(chalk.gray(`  Credential Preview: ${authConfig.credential?.substring(0, 20)}...`));
  console.log(chalk.gray(`  Model: ${authConfig.model}`));

  // For session-based auth, we need to pass the credential differently
  // The server expects either a Bearer token OR credentials in the body
  const headers: any = {
    'Content-Type': 'application/json'
  };

  // If we have a JWT token (from OAuth), use it as Bearer auth
  // Otherwise, send credentials in the body for the server to handle
  const tokenManager = new TokenManager();
  let bearerToken: string | null = null;

  try {
    const cacheGPTAuth = tokenManager.getCacheGPTAuth();
    if (cacheGPTAuth && cacheGPTAuth.value) {
      bearerToken = cacheGPTAuth.value;
      headers['Authorization'] = `Bearer ${bearerToken}`;
      console.log(chalk.gray('🔑 Using Bearer token authentication (OAuth)'));
    }
  } catch (e) {
    // No CacheGPT auth, will send credentials in body
    console.log(chalk.gray('📝 Using credential-based authentication (Session Key)'));
  }

  const requestBody = {
    provider: authConfig.provider,
    model: authConfig.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    authMethod: authConfig.authMethod,
    credential: authConfig.credential,
    // Include a flag to indicate this is a direct session request
    directSession: !bearerToken && authConfig.authMethod === 'web-session'
  };

  console.log(chalk.gray('\n📤 Request Details:'));
  console.log(chalk.gray(`  URL: ${apiUrl}/api/v2/unified-chat`));
  console.log(chalk.gray(`  Has Bearer Token: ${!!bearerToken}`));
  console.log(chalk.gray(`  Direct Session: ${requestBody.directSession}`));
  console.log(chalk.gray(`  Request Body (partial):`));
  console.log(chalk.gray(`    provider: ${requestBody.provider}`));
  console.log(chalk.gray(`    authMethod: ${requestBody.authMethod}`));
  console.log(chalk.gray(`    directSession: ${requestBody.directSession}`));
  console.log(chalk.gray(`    credential present: ${!!requestBody.credential}`));
  console.log(chalk.gray(`    messages count: ${requestBody.messages.length}`));

  const response = await fetch(`${apiUrl}/api/v2/unified-chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  console.log(chalk.gray(`\n📥 Response Status: ${response.status} ${response.statusText}`));

  if (!response.ok) {
    const error = await response.json();
    console.log(chalk.red('\n❌ Error Response:'));
    console.log(chalk.red(JSON.stringify(error, null, 2)));
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