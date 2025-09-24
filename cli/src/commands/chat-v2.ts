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

export async function chatV2Command(): Promise<void> {
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
      console.log(chalk.gray('Setup cancelled. Run "llm-cache chat" when ready.'));
      return;
    }

    // Open browser for OAuth authentication
    console.log(chalk.cyan('\n🌐 Opening browser for authentication...'));

    const open = await import('open').catch(() => null);
    const authUrl = `${process.env.CACHEGPT_APP_URL || 'https://cachegpt.app'}/login?source=cli&return_to=terminal`;

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
    console.log(chalk.gray('3. Copy your session token'));
    console.log();

    // Get session token from user
    const { sessionToken } = await inquirer.prompt({
      type: 'password',
      name: 'sessionToken',
      message: 'Paste your session token here:',
      validate: (input) => input.length > 0 || 'Session token is required'
    });

    console.log(chalk.gray('✅ Session token received'));
    console.log(chalk.gray('The browser will now guide you through provider selection and authentication...'));
    console.log(chalk.yellow('🔄 Return here after completing the browser setup'));

    // Wait for user confirmation that they completed browser setup
    const { completed } = await inquirer.prompt({
      type: 'confirm',
      name: 'completed',
      message: 'Have you completed the provider setup in the browser?',
      default: false
    });

    if (!completed) {
      console.log(chalk.gray('Please complete the browser setup and run the command again.'));
      return;
    }

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
        message: 'Which model would you like to use?',
        choices: [
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo-preview' },
          { name: 'GPT-4', value: 'gpt-4' },
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' }
        ],
        default: 'gpt-3.5-turbo'
      });
      model = selectedModel;
    } else if (provider === 'anthropic') {
      model = 'claude-3-opus-20240229';
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
            model: config.model || 'claude-3-opus-20240229',
            max_tokens: 1000,
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