import inquirer from 'inquirer';
import chalk from 'chalk';
import { UnifiedAuthManager, UnifiedAuthConfig } from '../lib/unified-auth';
import { saveConfig } from '../lib/config';
import { logError, logSuccess } from '../lib/utils';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Unified initialization command that supports both web sessions and API keys
 */
export async function initUnifiedCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan.bold('\n🚀 Welcome to CacheGPT Setup!\n'));
  console.log(chalk.white('Choose your AI provider and authentication method.'));
  console.log(chalk.gray('Web login uses your existing subscription ($20/month).'));
  console.log(chalk.gray('API keys require separate API billing.\n'));

  try {
    // Step 1: Choose provider
    const { provider } = await inquirer.prompt({
      type: 'list',
      name: 'provider',
      message: 'Which AI service would you like to use?',
      choices: [
        { name: '🤖 Claude (Anthropic)', value: 'claude' },
        { name: '💬 ChatGPT (OpenAI)', value: 'chatgpt' },
        { name: '✨ Gemini (Google)', value: 'gemini' },
        { name: '🔍 Perplexity AI', value: 'perplexity' }
      ]
    });

    // Step 2: Authenticate using unified manager
    const authManager = new UnifiedAuthManager();
    const authConfig = await authManager.authenticate(provider);

    // Step 3: Save configuration
    await saveAuthConfig(authConfig);

    // Success!
    console.log(chalk.green.bold('\n✅ Setup complete!\n'));
    console.log(chalk.cyan('Your authentication is saved and encrypted.'));
    console.log(chalk.cyan(`Using ${authConfig.authMethod === 'web-session' ? 'web session' : 'API key'} authentication.\n`));

    // Show next steps
    displayNextSteps(authConfig);

    // Ask if user wants to start chatting
    const { startChat } = await inquirer.prompt({
      type: 'confirm',
      name: 'startChat',
      message: 'Would you like to start chatting now?',
      default: true
    });

    if (startChat) {
      console.log(chalk.cyan('\n💬 Starting chat session...\n'));
      const { chatCommand } = await import('./chat');
      await chatCommand();
    }

  } catch (error: any) {
    logError('Setup failed:', error);
    process.exit(1);
  }
}

/**
 * Save the authentication configuration
 */
async function saveAuthConfig(authConfig: UnifiedAuthConfig): Promise<void> {
  // Convert to the format expected by chat command
  const config = {
    baseUrl: process.env.CACHEGPT_API_URL || 'https://cachegpt.app',
    apiKey: authConfig.authMethod === 'api-key' ? authConfig.credential : '',
    defaultModel: authConfig.model || 'gpt-5',
    timeout: 30000,
    mode: 'browser' as const,
    provider: authConfig.provider,
    cacheLocation: path.join(os.homedir(), '.cachegpt', 'cache')
  };

  // Also save in the new auth format for the unified system
  const authDir = path.join(os.homedir(), '.cachegpt', 'auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const authPath = path.join(authDir, `${authConfig.provider}.json`);
  const authData = {
    ...authConfig,
    savedAt: Date.now()
  };

  fs.writeFileSync(authPath, JSON.stringify(authData, null, 2));

  saveConfig(config);
  logSuccess('Configuration saved');
}

/**
 * Display next steps based on auth method
 */
function displayNextSteps(authConfig: UnifiedAuthConfig): void {
  console.log(chalk.yellow('📚 Next Steps:\n'));

  const commands = [
    { cmd: 'cachegpt chat', desc: 'Start chatting with AI' },
    { cmd: 'cachegpt status', desc: 'Check authentication status' },
    { cmd: 'cachegpt logout', desc: 'Log out and clear credentials' }
  ];

  commands.forEach(({ cmd, desc }) => {
    console.log(chalk.white(`  ${cmd.padEnd(20)} ${chalk.gray(desc)}`));
  });

  if (authConfig.authMethod === 'web-session') {
    console.log(chalk.green('\n💡 Pro Tip: Your browser login is saved and will be reused.'));
    console.log(chalk.green('   Just like Claude Code, you only need to log in once!'));
  } else {
    console.log(chalk.yellow('\n💡 Pro Tip: Keep your API key secure and never share it.'));
    console.log(chalk.yellow('   Consider using web login for a more cost-effective option.'));
  }

  console.log();
}