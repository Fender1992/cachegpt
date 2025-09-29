import chalk from 'chalk';
import inquirer from 'inquirer';
import { createClient } from '@supabase/supabase-js';
import { TokenManager } from '../lib/token-manager';

interface ApiKeyChoice {
  name: string;
  value: string;
  hasKey?: boolean;
}

const PROVIDERS: ApiKeyChoice[] = [
  { name: 'OpenAI (GPT-4)', value: 'openai' },
  { name: 'Anthropic (Claude)', value: 'anthropic' },
  { name: 'Google (Gemini)', value: 'google' },
  { name: 'Perplexity', value: 'perplexity' },
];

export async function apiKeysCommand(action?: string) {
  console.log(chalk.cyan('\n🔑 API Key Management\n'));

  const tokenManager = new TokenManager();
  let authToken = null;

  try {
    authToken = tokenManager.getCacheGPTAuth();
  } catch (error) {
    console.log(chalk.yellow('❌ Not authenticated. Please login first.'));
    console.log(chalk.cyan('\n  cachegpt login\n'));
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eohjmtrmeqjzqgeivlje.supabase.co';
  const supabase = createClient(supabaseUrl, authToken.value);

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.log(chalk.red('❌ Failed to authenticate. Please login again.'));
    return;
  }

  if (!action) {
    const { selectedAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAction',
        message: 'What would you like to do?',
        choices: [
          { name: 'Add API key', value: 'add' },
          { name: 'View API keys', value: 'view' },
          { name: 'Remove API key', value: 'remove' },
          { name: 'Test API key', value: 'test' },
        ],
      },
    ]);
    action = selectedAction;
  }

  switch (action) {
    case 'add':
      await addApiKey(supabase, user.id);
      break;
    case 'view':
      await viewApiKeys(supabase, user.id);
      break;
    case 'remove':
      await removeApiKey(supabase, user.id);
      break;
    case 'test':
      await testApiKey(supabase, user.id);
      break;
    default:
      console.log(chalk.red('Invalid action. Use: add, view, remove, or test'));
  }
}

async function addApiKey(supabase: any, userId: string) {
  // Get existing keys to show which ones are already configured
  const { data: existing } = await supabase
    .from('user_provider_credentials')
    .select('provider')
    .eq('user_id', userId)
    .not('api_key', 'is', null);

  const existingProviders = existing?.map((e: any) => e.provider) || [];

  const availableProviders = PROVIDERS.map(p => ({
    ...p,
    name: existingProviders.includes(mapProvider(p.value))
      ? `${p.name} ✓`
      : p.name,
    hasKey: existingProviders.includes(mapProvider(p.value))
  }));

  const { provider, apiKey } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select provider:',
      choices: availableProviders,
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your API key:',
      validate: (input: string) => {
        if (!input || input.length < 10) {
          return 'Please enter a valid API key';
        }
        return true;
      },
    },
  ]);

  // Enable enterprise mode
  await supabase
    .from('user_profiles')
    .update({ enterprise_mode: true })
    .eq('user_id', userId);

  // Get user email
  const { data: { user } } = await supabase.auth.getUser();

  // Save the API key
  const { error } = await supabase
    .from('user_provider_credentials')
    .upsert({
      user_id: userId,
      user_email: user?.email || '',
      provider: mapProvider(provider),
      api_key: btoa(apiKey), // Base64 encode
      status: 'ready',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider'
    });

  if (error) {
    console.log(chalk.red('❌ Failed to save API key:', error.message));
  } else {
    console.log(chalk.green('✅ API key saved successfully!'));
    console.log(chalk.gray('\nYour chat sessions will now use this API key instead of free providers.'));
  }
}

async function viewApiKeys(supabase: any, userId: string) {
  const { data: credentials } = await supabase
    .from('user_provider_credentials')
    .select('provider, api_key, updated_at')
    .eq('user_id', userId)
    .not('api_key', 'is', null);

  if (!credentials || credentials.length === 0) {
    console.log(chalk.yellow('No API keys configured.'));
    console.log(chalk.gray('\nRun "cachegpt api-keys add" to add your first API key.'));
    return;
  }

  console.log(chalk.white('\nYour configured API keys:\n'));

  credentials.forEach((cred: any) => {
    const key = atob(cred.api_key);
    const masked = maskApiKey(key);
    const providerName = getProviderName(cred.provider);
    const updated = new Date(cred.updated_at).toLocaleDateString();

    console.log(`  ${chalk.cyan(providerName)}: ${chalk.gray(masked)} (updated ${updated})`);
  });

  console.log(chalk.gray('\n💡 Tip: Run "cachegpt api-keys test" to verify your keys are working.'));
}

async function removeApiKey(supabase: any, userId: string) {
  const { data: credentials } = await supabase
    .from('user_provider_credentials')
    .select('provider')
    .eq('user_id', userId)
    .not('api_key', 'is', null);

  if (!credentials || credentials.length === 0) {
    console.log(chalk.yellow('No API keys to remove.'));
    return;
  }

  const choices = credentials.map((cred: any) => ({
    name: getProviderName(cred.provider),
    value: cred.provider,
  }));

  const { provider, confirm } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select API key to remove:',
      choices,
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to remove this API key?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray('Cancelled.'));
    return;
  }

  const { error } = await supabase
    .from('user_provider_credentials')
    .update({ api_key: null })
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    console.log(chalk.red('❌ Failed to remove API key:', error.message));
  } else {
    console.log(chalk.green('✅ API key removed successfully.'));
    console.log(chalk.gray('\nChat will now use free providers for this service.'));
  }
}

async function testApiKey(supabase: any, userId: string) {
  const { data: credentials } = await supabase
    .from('user_provider_credentials')
    .select('provider, api_key')
    .eq('user_id', userId)
    .not('api_key', 'is', null);

  if (!credentials || credentials.length === 0) {
    console.log(chalk.yellow('No API keys to test.'));
    return;
  }

  console.log(chalk.cyan('\nTesting your API keys...\n'));

  for (const cred of credentials) {
    const providerName = getProviderName(cred.provider);
    process.stdout.write(`  Testing ${providerName}... `);

    const apiKey = atob(cred.api_key);
    const isValid = await testProviderKey(cred.provider, apiKey);

    if (isValid) {
      console.log(chalk.green('✅ Working'));
    } else {
      console.log(chalk.red('❌ Invalid or expired'));
    }
  }

  console.log();
}

async function testProviderKey(provider: string, apiKey: string): Promise<boolean> {
  try {
    switch (provider) {
      case 'chatgpt':
        const openaiResponse = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return openaiResponse.ok;

      case 'claude':
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          })
        });
        // 401 means invalid key, other errors might be rate limits etc
        return claudeResponse.status !== 401;

      case 'gemini':
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        return geminiResponse.ok;

      case 'perplexity':
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'pplx-7b-online',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          })
        });
        return perplexityResponse.status !== 401;

      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

function mapProvider(provider: string): string {
  const mapping: Record<string, string> = {
    'openai': 'chatgpt',
    'anthropic': 'claude',
    'google': 'gemini',
    'perplexity': 'perplexity'
  };
  return mapping[provider] || provider;
}

function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    'chatgpt': 'OpenAI',
    'claude': 'Anthropic',
    'gemini': 'Google Gemini',
    'perplexity': 'Perplexity'
  };
  return names[provider] || provider;
}