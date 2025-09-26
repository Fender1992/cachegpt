/**
 * Free LLM Provider Management
 * Manages rotation between free providers when rate limits are hit
 */

export interface FreeProvider {
  name: string;
  apiKey: string; // Server-side API keys
  endpoint: string;
  model: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  priority: number; // Lower = higher priority
  isAvailable: boolean;
}

// Server-side API keys for free providers
// These are provided by the server, users don't need them
export const FREE_PROVIDERS: FreeProvider[] = [
  {
    name: 'groq',
    apiKey: process.env.GROQ_API_KEY || '',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerDay: 14400
    },
    priority: 1, // Best free option
    isAvailable: true
  },
  {
    name: 'together',
    apiKey: process.env.TOGETHER_API_KEY || '',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    model: 'meta-llama/Llama-3-70b-chat-hf',
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 1000
    },
    priority: 2,
    isAvailable: true
  },
  {
    name: 'openrouter-free',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'nousresearch/nous-hermes-2-mixtral-8x7b-dpo', // Free model
    rateLimit: {
      requestsPerMinute: 20,
      requestsPerDay: 500
    },
    priority: 3,
    isAvailable: true
  },
  {
    name: 'huggingface',
    apiKey: process.env.HUGGINGFACE_API_KEY || '',
    endpoint: 'https://api-inference.huggingface.co/models/',
    model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    rateLimit: {
      requestsPerMinute: 10,
      requestsPerDay: 1000
    },
    priority: 4,
    isAvailable: true
  }
];

// Track usage per user
interface UserUsage {
  userId: string;
  provider: string;
  minuteCount: number;
  dayCount: number;
  lastMinuteReset: Date;
  lastDayReset: Date;
}

const userUsageMap = new Map<string, Map<string, UserUsage>>();

/**
 * Get the next available provider for a user
 */
export async function getNextAvailableProvider(userId: string): Promise<FreeProvider | null> {
  // Sort providers by priority
  const sortedProviders = [...FREE_PROVIDERS]
    .filter(p => p.apiKey && p.isAvailable)
    .sort((a, b) => a.priority - b.priority);

  for (const provider of sortedProviders) {
    if (await isProviderAvailableForUser(userId, provider)) {
      return provider;
    }
  }

  return null; // All providers exhausted
}

/**
 * Check if a provider is available for a user (not rate limited)
 */
async function isProviderAvailableForUser(userId: string, provider: FreeProvider): Promise<boolean> {
  const usage = getUserUsage(userId, provider.name);

  // Reset counters if needed
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60000);
  const dayAgo = new Date(now.getTime() - 86400000);

  if (usage.lastMinuteReset < minuteAgo) {
    usage.minuteCount = 0;
    usage.lastMinuteReset = now;
  }

  if (usage.lastDayReset < dayAgo) {
    usage.dayCount = 0;
    usage.lastDayReset = now;
  }

  // Check rate limits
  return usage.minuteCount < provider.rateLimit.requestsPerMinute &&
         usage.dayCount < provider.rateLimit.requestsPerDay;
}

/**
 * Get or create usage tracking for a user/provider
 */
function getUserUsage(userId: string, providerName: string): UserUsage {
  if (!userUsageMap.has(userId)) {
    userUsageMap.set(userId, new Map());
  }

  const userProviders = userUsageMap.get(userId)!;

  if (!userProviders.has(providerName)) {
    userProviders.set(providerName, {
      userId,
      provider: providerName,
      minuteCount: 0,
      dayCount: 0,
      lastMinuteReset: new Date(),
      lastDayReset: new Date()
    });
  }

  return userProviders.get(providerName)!;
}

/**
 * Increment usage for a user/provider
 */
export function incrementUsage(userId: string, providerName: string): void {
  const usage = getUserUsage(userId, providerName);
  usage.minuteCount++;
  usage.dayCount++;
}

/**
 * Call a free provider with automatic fallback
 */
export async function callFreeProvider(
  userId: string,
  messages: any[],
  preferredProvider?: string
): Promise<{ response: string; provider: string; cached: boolean }> {
  // First, check cache
  const { findSimilarCachedResponse } = await import('./ranking-cache');

  const userMessage = messages[messages.length - 1]?.content;
  if (userMessage) {
    const cachedMatch = await findSimilarCachedResponse(
      userMessage,
      'free-model',
      'mixed',
      0.85
    );

    if (cachedMatch) {
      console.log('[FREE] Cache hit! Returning cached response');
      return {
        response: cachedMatch.cached_response.response,
        provider: 'cache',
        cached: true
      };
    }
  }

  // Try preferred provider first if specified
  let providers = [...FREE_PROVIDERS].filter(p => p.apiKey && p.isAvailable);

  console.log(`[FREE] Available providers: ${providers.map(p => p.name).join(', ')}`);

  if (preferredProvider) {
    const preferred = providers.find(p => p.name === preferredProvider);
    if (preferred && await isProviderAvailableForUser(userId, preferred)) {
      providers = [preferred, ...providers.filter(p => p.name !== preferredProvider)];
    }
  } else {
    providers.sort((a, b) => a.priority - b.priority);
  }

  // Try each provider until one works
  for (const provider of providers) {
    // Check if provider has API key
    if (!provider.apiKey) {
      console.log(`[FREE] ${provider.name} has no API key configured`);
      continue;
    }

    if (!await isProviderAvailableForUser(userId, provider)) {
      const usage = getUserUsage(userId, provider.name);
      console.log(`[FREE] ${provider.name} rate limited for user ${userId} (minute: ${usage.minuteCount}/${provider.rateLimit.requestsPerMinute}, day: ${usage.dayCount}/${provider.rateLimit.requestsPerDay})`);
      continue;
    }

    try {
      console.log(`[FREE] Trying ${provider.name} for user ${userId}`);
      const startTime = Date.now();
      const response = await callProvider(provider, messages);
      const responseTime = Date.now() - startTime;

      // Increment usage on success
      incrementUsage(userId, provider.name);

      // Cache the response with consistent model name
      if (userMessage && response) {
        const { cacheResponse } = await import('./ranking-cache');
        await cacheResponse(
          userMessage,
          response,
          'free-model',  // Use consistent model name for all free providers
          'mixed',       // Use 'mixed' as provider to match cache checking
          userId,
          responseTime
        );
        console.log(`[FREE] Response cached with mixed provider (${responseTime}ms)`);
      }

      return {
        response,
        provider: provider.name,
        cached: false
      };
    } catch (error: any) {
      console.error(`[FREE] ${provider.name} failed:`, error.message);

      // Mark provider as unavailable if it's a persistent error
      if (error.message.includes('401') || error.message.includes('403')) {
        provider.isAvailable = false;
      }

      continue; // Try next provider
    }
  }

  throw new Error('All free providers are currently rate limited. Please try again later.');
}

/**
 * Call a specific provider
 */
async function callProvider(provider: FreeProvider, messages: any[]): Promise<string> {
  let endpoint = provider.endpoint;
  let body: any;

  if (provider.name === 'huggingface') {
    // HuggingFace has a different API format
    endpoint += provider.model;
    body = {
      inputs: messages.map(m => m.content).join('\n'),
      parameters: {
        max_new_tokens: 1000,
        temperature: 0.7
      }
    };
  } else {
    // OpenAI-compatible format (Groq, Together, OpenRouter)
    body = {
      model: provider.model,
      messages,
      temperature: 0.7,
      max_tokens: 1000
    };
  }

  const headers: any = {
    'Content-Type': 'application/json'
  };

  // Set authorization header based on provider
  if (provider.name === 'huggingface') {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  } else if (provider.name === 'openrouter-free') {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
    headers['HTTP-Referer'] = 'https://cachegpt.app';
    headers['X-Title'] = 'CacheGPT';
  } else {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${provider.name} error (${response.status}): ${error}`);
  }

  const data = await response.json();

  // Extract response based on provider format
  if (provider.name === 'huggingface') {
    return data[0]?.generated_text || data.generated_text || 'No response';
  } else {
    return data.choices[0]?.message?.content || 'No response';
  }
}