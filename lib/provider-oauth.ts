// Provider OAuth configurations and URLs

interface ProviderOAuthConfig {
  name: string;
  authUrl: string;
  scopes: string[];
  redirectUri: string;
  clientId?: string;
  requiresApiKey: boolean;
  description: string;
}

export const PROVIDER_CONFIGS: Record<string, ProviderOAuthConfig> = {
  openai: {
    name: 'OpenAI',
    authUrl: 'https://auth.openai.com/oauth2/authorize', // This is hypothetical - OpenAI doesn't have OAuth yet
    scopes: ['api'],
    redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/provider-callback`,
    requiresApiKey: true, // For now, OpenAI only supports API keys
    description: 'Access ChatGPT models via OpenAI API'
  },
  claude: {
    name: 'Anthropic Claude',
    authUrl: 'https://claude.ai/api/oauth/authorize', // This is hypothetical - need to check if Anthropic has OAuth
    scopes: ['chat', 'api'],
    redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/provider-callback`,
    requiresApiKey: true, // For now, Anthropic only supports API keys
    description: 'Chat with Claude models directly'
  },
  google: {
    name: 'Google AI',
    authUrl: 'https://accounts.google.com/oauth2/auth',
    scopes: ['https://www.googleapis.com/auth/generative-language'],
    redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/provider-callback`,
    clientId: process.env.GOOGLE_CLIENT_ID,
    requiresApiKey: false, // Google has proper OAuth
    description: 'Access Gemini models via Google AI'
  },
  perplexity: {
    name: 'Perplexity',
    authUrl: 'https://perplexity.ai/oauth/authorize', // This is hypothetical
    scopes: ['api'],
    redirectUri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/provider-callback`,
    requiresApiKey: true, // Most likely API key only
    description: 'AI-powered search and chat'
  }
};

export function getProviderOAuthUrl(provider: string, state: string): string {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Provider ${provider} not supported`);
  }

  // For providers that don't have OAuth yet, return API key setup URL
  if (config.requiresApiKey) {
    return `/auth/provider-setup?provider=${provider}&source=cli&step=api-key`;
  }

  // For providers with proper OAuth
  const params = new URLSearchParams({
    client_id: config.clientId || '',
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    response_type: 'code',
    state: state,
    access_type: 'offline',
    prompt: 'consent'
  });

  return `${config.authUrl}?${params.toString()}`;
}

export function isProviderOAuthSupported(provider: string): boolean {
  const config = PROVIDER_CONFIGS[provider];
  return config ? !config.requiresApiKey : false;
}

export function getProviderApiKeyInstructions(provider: string) {
  switch (provider) {
    case 'openai':
      return {
        title: 'OpenAI API Key Setup',
        url: 'https://platform.openai.com/api-keys',
        instructions: [
          'Sign in to your OpenAI account',
          'Navigate to API Keys',
          'Click "Create new secret key"',
          'Copy the key (starts with sk-...)',
          'Your API key will be stored securely in your browser'
        ],
        placeholder: 'sk-...',
        note: 'Note: OpenAI doesn\'t support OAuth yet, so we\'ll use your API key for secure access.'
      };

    case 'claude':
      return {
        title: 'Anthropic Claude API Key Setup',
        url: 'https://console.anthropic.com/settings/keys',
        instructions: [
          'Sign in to your Anthropic account',
          'Go to API Keys section',
          'Click "Create Key"',
          'Copy the key (starts with sk-ant-...)',
          'Your API key will be stored securely in your browser'
        ],
        placeholder: 'sk-ant-...',
        note: 'Note: Anthropic doesn\'t support OAuth yet, so we\'ll use your API key for secure access.'
      };

    case 'google':
      return {
        title: 'Google AI Studio Setup',
        url: 'https://makersuite.google.com/app/apikey',
        instructions: [
          'Sign in with your Google account',
          'Go to API Keys section',
          'Click "Create API Key"',
          'Copy the key (starts with AIza...)',
          'Your API key will be stored securely in your browser'
        ],
        placeholder: 'AIza...',
        note: 'Alternatively, we can set up Google OAuth for you.'
      };

    case 'perplexity':
      return {
        title: 'Perplexity API Key Setup',
        url: 'https://www.perplexity.ai/settings/api',
        instructions: [
          'Sign in to your Perplexity account',
          'Navigate to API settings',
          'Generate a new API key',
          'Copy the key (starts with pplx-...)',
          'Your API key will be stored securely in your browser'
        ],
        placeholder: 'pplx-...',
        note: 'Note: Perplexity currently uses API keys for authentication.'
      };

    default:
      return null;
  }
}