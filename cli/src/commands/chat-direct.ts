import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { loadConfig } from '../lib/config';
import { LocalCache } from '../lib/cache';

// API endpoints for different providers
const API_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  mistral: 'https://api.mistral.ai/v1/chat/completions'
};

export async function chatDirectCommand(): Promise<void> {
  const config: any = loadConfig();

  if (!config || config.mode !== 'direct') {
    console.log(chalk.red('Direct mode not configured. Run "cachegpt init" first.'));
    process.exit(1);
  }

  const cache = new LocalCache(config.cacheLocation);
  const stats = cache.getStats();

  console.clear();
  console.log(chalk.cyan.bold('\n💬 CacheGPT Chat - Direct Mode\n'));
  console.log(chalk.gray(`Model: ${config.defaultModel}`));
  console.log(chalk.gray(`Cache: ${stats.entries} entries | ${stats.hitRate.toFixed(1)}% hit rate | $${stats.totalSaved.toFixed(2)} saved\n`));
  console.log(chalk.yellow('Type "exit" to quit, "clear" to clear screen, "stats" for statistics\n'));

  const messages: Array<{ role: string; content: string }> = [];

  while (true) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: chalk.green('You:'),
      prefix: ''
    }]);

    if (input.toLowerCase() === 'exit') {
      console.log(chalk.gray('\nGoodbye! 👋'));
      break;
    }

    if (input.toLowerCase() === 'clear') {
      console.clear();
      continue;
    }

    if (input.toLowerCase() === 'stats') {
      displayStats(cache);
      continue;
    }

    // Check cache first
    const startTime = Date.now();
    const cachedResponse = cache.get(input, config.defaultModel);

    if (cachedResponse) {
      const responseTime = Date.now() - startTime;
      console.log(chalk.cyan('\nAssistant:'), cachedResponse.response);
      console.log(chalk.green(`\n✨ Cached response | ${responseTime}ms | Saved $${cachedResponse.cost.toFixed(4)}\n`));
      messages.push({ role: 'user', content: input });
      messages.push({ role: 'assistant', content: cachedResponse.response });
    } else {
      // Make API call
      const spinner = ora('Thinking...').start();

      try {
        const response = await callLLMProvider(
          input,
          messages,
          config.defaultModel,
          config.providers,
          config.temperature,
          config.maxTokens
        );

        spinner.stop();

        const responseTime = Date.now() - startTime;
        const tokens = estimateTokens(response);
        const cost = estimateCost(config.defaultModel, tokens);

        // Cache the response
        cache.set(input, response, config.defaultModel, tokens, cost);

        console.log(chalk.cyan('\nAssistant:'), response);
        console.log(chalk.gray(`\n⚡ API call | ${responseTime}ms | ${tokens} tokens | Cost: $${cost.toFixed(4)}\n`));

        messages.push({ role: 'user', content: input });
        messages.push({ role: 'assistant', content: response });
      } catch (error: any) {
        spinner.stop();
        console.log(chalk.red('\n❌ Error:'), error.message);
        console.log(chalk.gray('Try again or type "exit" to quit.\n'));
      }
    }
  }
}

async function callLLMProvider(
  query: string,
  history: Array<{ role: string; content: string }>,
  model: string,
  providers: any,
  temperature: number,
  maxTokens: number
): Promise<string> {
  // Determine which provider to use based on model
  let provider = 'openai';
  if (model.includes('claude')) provider = 'anthropic';
  else if (model.includes('gemini')) provider = 'google';
  else if (model.includes('mistral')) provider = 'mistral';

  const apiKey = decryptApiKey(providers[provider]);
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}`);
  }

  const messages = [...history, { role: 'user', content: query }];

  switch (provider) {
    case 'openai':
      return await callOpenAI(apiKey, model, messages, temperature, maxTokens);
    case 'anthropic':
      return await callAnthropic(apiKey, model, messages, temperature, maxTokens);
    case 'google':
      return await callGoogle(apiKey, model, query, temperature, maxTokens);
    case 'mistral':
      return await callMistral(apiKey, model, messages, temperature, maxTokens);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(API_ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(API_ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data: any = await response.json();
  return data.content[0].text;
}

async function callGoogle(
  apiKey: string,
  model: string,
  query: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const url = `${API_ENDPOINTS.google}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: query
        }]
      }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${error}`);
  }

  const data: any = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function callMistral(
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(API_ENDPOINTS.mistral, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${error}`);
  }

  const data: any = await response.json();
  return data.choices[0].message.content;
}

function decryptApiKey(encrypted: any): string | null {
  if (!encrypted || !encrypted.data || !encrypted.iv) return null;

  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(os.hostname(), 'salt', 32);
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    return null;
  }
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

function estimateCost(model: string, tokens: number): number {
  const costs: { [key: string]: number } = {
    'gpt-3.5-turbo': 0.002 / 1000,
    'gpt-4': 0.06 / 1000,
    'gpt-4-turbo-preview': 0.03 / 1000,
    'claude-3-opus-20240229': 0.06 / 1000,
    'claude-3-sonnet-20240229': 0.03 / 1000,
    'claude-3-haiku-20240307': 0.015 / 1000,
    'gemini-pro': 0.025 / 1000,
    'mistral-tiny': 0.01 / 1000,
    'mistral-small': 0.02 / 1000,
    'mistral-medium': 0.03 / 1000
  };

  const costPerToken = costs[model] || 0.002 / 1000;
  return tokens * costPerToken;
}

function displayStats(cache: LocalCache): void {
  const stats = cache.getStats();

  console.log(chalk.cyan('\n📊 Cache Statistics\n'));
  console.log(chalk.white('  Total Hits:      '), chalk.green(stats.totalHits.toString()));
  console.log(chalk.white('  Total Misses:    '), chalk.yellow(stats.totalMisses.toString()));
  console.log(chalk.white('  Hit Rate:        '), chalk.blue(`${stats.hitRate.toFixed(1)}%`));
  console.log(chalk.white('  Cache Entries:   '), stats.entries);
  console.log(chalk.white('  Total Saved:     '), chalk.green(`$${stats.totalSaved.toFixed(2)}`));
  console.log();
}