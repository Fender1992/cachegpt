#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createInterface } from 'readline';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createServer, Server } from 'http';
import { parse } from 'url';
import { config } from 'dotenv';

// Load environment variables
config();

interface LocalConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'perplexity';
  apiKey: string;
  model?: string;
  user?: {
    email: string;
    name: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  provider: string;
  model: string;
}

export async function chatCommand(): Promise<void> {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║         CacheGPT Chat Interface 💬           ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
  console.log();

  // Check for local configuration
  const configPath = path.join(os.homedir(), '.cachegpt', 'config.json');
  const historyPath = path.join(os.homedir(), '.cachegpt', 'history');

  // Ensure directories exist
  if (!fs.existsSync(path.dirname(configPath))) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }
  if (!fs.existsSync(historyPath)) {
    fs.mkdirSync(historyPath, { recursive: true });
  }

  let config: LocalConfig | null = null;

  // Try to load existing configuration
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(chalk.green(`👋 Welcome back${config?.user ? ', ' + config.user.name : ''}!`));
      console.log(chalk.gray(`Using ${config?.provider} (${config?.model || 'default model'})`));
      console.log();
    } catch (error) {
      console.log(chalk.yellow('⚠️  Configuration file is corrupted. Please reconfigure.'));
    }
  }

  // If no config, run OAuth flow and setup
  if (!config) {
    console.log(chalk.yellow('🔐 First time setup required'));
    console.log(chalk.gray('You need to authenticate and configure your LLM provider.'));
    console.log();

    const { proceed } = await inquirer.prompt({
      type: 'confirm',
      name: 'proceed',
      message: 'Would you like to set up now?',
      default: true
    });

    if (!proceed) {
      console.log(chalk.gray('Setup cancelled. Run "cachegpt chat" when ready.'));
      return;
    }

    // Start local server to receive auth callback
    console.log(chalk.cyan('\n🌐 Starting authentication server...'));

    const authResult = await startAuthServer();
    if (!authResult.success) {
      console.log(chalk.red('Failed to start authentication server'));
      return;
    }

    const { port, server } = authResult;
    console.log(chalk.green(`✅ Auth server listening on port ${port}`));

    // Open browser for OAuth authentication
    console.log(chalk.cyan('🌐 Opening browser for authentication...'));

    const open = await import('open').catch(() => null);
    const authUrl = `${process.env.CACHEGPT_APP_URL || 'https://cachegpt.app'}/login?source=cli&return_to=terminal&callback_port=${port}`;

    if (open) {
      await open.default(authUrl);
      console.log(chalk.green('✅ Browser opened'));
    } else {
      console.log(chalk.yellow('Please open this URL in your browser:'));
      console.log(chalk.blue.underline(authUrl));
    }

    console.log();
    console.log(chalk.gray('1. Complete OAuth login (Google/GitHub)'));
    console.log(chalk.gray('2. Select your LLM provider'));
    console.log(chalk.gray('3. Browser will automatically redirect back to CLI'));
    console.log();
    console.log(chalk.yellow('⏳ Waiting for authentication to complete...'));

    // Wait for authentication response
    const authResponse = await waitForAuthCallback(server!, port!);

    if (!authResponse.success) {
      console.log(chalk.red('Authentication failed:', authResponse.error));
      server!.close();
      return;
    }

    console.log(chalk.green('✅ Authentication successful!'));

    // Use the received credentials
    config = {
      provider: authResponse.provider as any,
      apiKey: authResponse.apiKey || '',
      model: authResponse.model,
      user: authResponse.user
    };

    // Now try to load provider credentials from the server
    console.log(chalk.cyan('🔍 Loading your provider credentials...'));

    // In a real implementation, we'd fetch from the API using sessionToken
    // For now, we'll still ask for provider selection
    console.log(chalk.cyan('\n🤖 LLM Provider Setup'));

    const { provider } = await inquirer.prompt({
      type: 'list',
      name: 'provider',
      message: 'Which LLM provider would you like to use?',
      choices: [
        { name: 'OpenAI (ChatGPT)', value: 'openai' },
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'Google (Gemini)', value: 'google' },
        { name: 'Perplexity', value: 'perplexity' }
      ]
    });

    // Get API key for the selected provider
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google AI',
      perplexity: 'Perplexity'
    };

    const { apiKey } = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${providerNames[provider]} API key:`,
      validate: (input) => input.length > 0 || 'API key is required'
    });

    // Select model if applicable
    let model = '';
    if (provider === 'openai') {
      const { selectedModel } = await inquirer.prompt({
        type: 'list',
        name: 'selectedModel',
        message: 'Which OpenAI model would you like to use?',
        choices: [
          { name: 'GPT-5 (Latest)', value: 'gpt-5' },
          { name: 'GPT-5 Vision', value: 'gpt-5-vision' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo-preview' },
          { name: 'GPT-4', value: 'gpt-4' }
        ],
        default: 'gpt-5'
      });
      model = selectedModel;
    } else if (provider === 'anthropic') {
      const { selectedModel } = await inquirer.prompt({
        type: 'list',
        name: 'selectedModel',
        message: 'Which Claude model would you like to use?',
        choices: [
          { name: 'Claude Opus 4.1 (Latest)', value: 'claude-opus-4-1-20250805' },
          { name: 'Claude Sonnet 4 (Fast)', value: 'claude-sonnet-4-20250924' },
          { name: 'Claude 3 Haiku (Ultra Fast)', value: 'claude-3-haiku-20240307' }
        ],
        default: 'claude-opus-4-1-20250805'
      });
      model = selectedModel;
    } else if (provider === 'google') {
      const { selectedModel } = await inquirer.prompt({
        type: 'list',
        name: 'selectedModel',
        message: 'Which Gemini model would you like to use?',
        choices: [
          { name: 'Gemini 2.0 Ultra (Latest)', value: 'gemini-2.0-ultra' },
          { name: 'Gemini 2.0 Pro (Fast)', value: 'gemini-2.0-pro' },
          { name: 'Gemini 1.5 Flash (Ultra Fast)', value: 'gemini-1.5-flash' }
        ],
        default: 'gemini-2.0-ultra'
      });
      model = selectedModel;
    } else if (provider === 'perplexity') {
      const { selectedModel } = await inquirer.prompt({
        type: 'list',
        name: 'selectedModel',
        message: 'Which Perplexity model would you like to use?',
        choices: [
          { name: 'Perplexity Pro Online (Latest)', value: 'pplx-pro-online' },
          { name: 'Sonar Ultra Online', value: 'sonar-ultra-online' },
          { name: 'Llama 3 405B', value: 'llama-3-405b-instruct' }
        ],
        default: 'pplx-pro-online'
      });
      model = selectedModel;
    }

    // Save configuration
    config = {
      provider: provider as any,
      apiKey,
      model,
      user: {
        email: 'user@cachegpt.local',
        name: 'CacheGPT User'
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green('\n✅ Configuration saved successfully!'));
    console.log();
  }

  // Start chat session
  console.log(chalk.cyan('💬 Starting chat session...'));
  console.log(chalk.gray('Type "exit" to quit, "clear" to clear screen, "history" to view past chats'));
  console.log();

  // Create new session
  const sessionId = Date.now().toString();
  const session: ChatSession = {
    id: sessionId,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    provider: config.provider,
    model: config.model || 'default'
  };

  // Initialize LLM client
  let llmClient: any;
  if (config.provider === 'openai') {
    llmClient = new OpenAI({ apiKey: config.apiKey });
  } else if (config.provider === 'anthropic') {
    llmClient = new Anthropic({ apiKey: config.apiKey });
  } else {
    console.log(chalk.red('Provider not yet implemented. Please use OpenAI or Anthropic.'));
    return;
  }

  // Chat loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    rl.question(chalk.cyan('You: '), async (input) => {
      if (input.toLowerCase() === 'exit') {
        // Save session to history
        const sessionFile = path.join(historyPath, `${sessionId}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
        console.log(chalk.gray('\nChat saved to history. Goodbye!'));
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'clear') {
        console.clear();
        console.log(chalk.cyan('💬 Chat cleared\n'));
        prompt();
        return;
      }

      if (input.toLowerCase() === 'history') {
        const files = fs.readdirSync(historyPath)
          .filter(f => f.endsWith('.json'))
          .sort()
          .reverse()
          .slice(0, 10);

        console.log(chalk.cyan('\n📚 Recent chat sessions:'));
        files.forEach((file, i) => {
          const data = JSON.parse(fs.readFileSync(path.join(historyPath, file), 'utf8'));
          console.log(chalk.gray(`  ${i + 1}. ${new Date(data.createdAt).toLocaleString()} - ${data.messages.length} messages`));
        });
        console.log();
        prompt();
        return;
      }

      // Add user message to session
      session.messages.push({
        role: 'user',
        content: input,
        timestamp: new Date()
      });

      // Get LLM response
      const spinner = ora('Thinking...').start();

      try {
        let response = '';

        if (config.provider === 'openai') {
          const completion = await llmClient.chat.completions.create({
            model: config.model || 'gpt-3.5-turbo',
            messages: session.messages.map(m => ({
              role: m.role,
              content: m.content
            })),
            temperature: 0.7
          });
          response = completion.choices[0]?.message?.content || 'No response';
        } else if (config.provider === 'anthropic') {
          const completion = await llmClient.messages.create({
            model: config.model || 'claude-opus-4-1-20250805',
            max_tokens: 4000,
            messages: session.messages.map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content
            }))
          });
          response = completion.content[0]?.text || 'No response';
        }

        spinner.stop();

        // Add assistant response to session
        session.messages.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });

        session.updatedAt = new Date();

        // Display response
        console.log(chalk.green('Assistant: ') + response);
        console.log();

        // Auto-save every few messages
        if (session.messages.length % 5 === 0) {
          const sessionFile = path.join(historyPath, `${sessionId}.json`);
          fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
        }

      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red('Error: ') + error.message);
        console.log();
      }

      prompt();
    });
  };

  prompt();
}

// Helper functions for local auth server
async function startAuthServer(): Promise<{ success: boolean; port?: number; server?: Server; error?: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url || '', true);

      if (parsedUrl.pathname === '/auth/callback') {
        const { provider, apiKey, model, user, error } = parsedUrl.query;

        // Send success response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Complete</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     display: flex; align-items: center; justify-content: center; min-height: 100vh;
                     margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
              .container { background: white; padding: 2rem; border-radius: 12px; text-align: center;
                          box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px; }
              .success { color: #10B981; }
              .error { color: #EF4444; }
            </style>
          </head>
          <body>
            <div class="container">
              ${error ? `
                <h2 class="error">Authentication Failed</h2>
                <p>Error: ${error}</p>
              ` : `
                <h2 class="success">Authentication Successful!</h2>
                <p>You can now return to your terminal. This window will close automatically.</p>
              `}
            </div>
            <script>
              setTimeout(() => window.close(), ${error ? 5000 : 2000});
            </script>
          </body>
          </html>
        `);

        // Trigger callback resolution
        (server as any).authCallback = {
          success: !error,
          provider: provider as string,
          apiKey: apiKey as string,
          model: model as string,
          user: user ? JSON.parse(user as string) : null,
          error: error as string
        };

        return;
      }

      // 404 for other paths
      res.writeHead(404);
      res.end('Not found');
    });

    // Try to find an available port
    const tryPort = (port: number) => {
      server.listen(port, 'localhost', () => {
        resolve({ success: true, port, server });
      }).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && port < 9000) {
          tryPort(port + 1);
        } else {
          resolve({ success: false, error: err.message });
        }
      });
    };

    tryPort(8787); // Start with port 8787
  });
}

async function waitForAuthCallback(server: Server, port: number): Promise<{
  success: boolean;
  provider?: string;
  apiKey?: string;
  model?: string;
  user?: any;
  error?: string;
}> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'Authentication timeout (5 minutes)' });
    }, 5 * 60 * 1000); // 5 minute timeout

    // Check for callback result every second
    const checkCallback = () => {
      const authCallback = (server as any).authCallback;
      if (authCallback) {
        clearTimeout(timeout);
        server.close();
        resolve(authCallback);
        return;
      }
      setTimeout(checkCallback, 1000);
    };

    checkCallback();
  });
}