/**
 * LLM Provider Configuration
 *
 * Centralized configuration for all LLM providers with explicit precedence rules.
 * Default behavior: internal → free → (premium only if explicitly allowed)
 *
 * IMPORTANT: Presence of ANTHROPIC_API_KEY does NOT change default provider selection.
 * Premium providers are ONLY used when:
 * 1. Explicitly requested via x-llm-provider header
 * 2. User has stored their own API key in database
 * 3. Fallback is explicitly allowed via LLM_ALLOW_FALLBACK_TO_PREMIUM=true
 */

export type ProviderName = 'internal' | 'free' | 'anthropic' | 'openai' | 'google' | 'perplexity' | 'grok';

export interface InternalLLMConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  healthCheckUrl: string;
  healthCheckIntervalMs: number;
  timeoutMs: number;
}

export interface FreeProvidersConfig {
  groq: {
    enabled: boolean;
    apiKey: string;
  };
  openrouter: {
    enabled: boolean;
    apiKey: string;
  };
  huggingface: {
    enabled: boolean;
    apiKey: string;
    models?: string[]; // Optional: specify which models to use
  };
}

export interface PremiumProviderConfig {
  enabled: boolean;
  apiKey: string;
}

export interface LLMConfigType {
  // Default provider when no override specified
  defaultProvider: ProviderName;

  // Internal/native LLM (first priority)
  internal: InternalLLMConfig;

  // Free external providers (second priority)
  free: FreeProvidersConfig;

  // Premium providers (only use if explicitly requested)
  premium: {
    anthropic: PremiumProviderConfig;
    openai: PremiumProviderConfig;
    google: PremiumProviderConfig;
    perplexity: PremiumProviderConfig;
    grok: PremiumProviderConfig;
  };

  // Fallback behavior
  allowFallbackToFree: boolean;
  allowFallbackToPremium: boolean;
  hardFailOnInternalDown: boolean;

  // Per-request override via x-llm-provider header
  allowPerRequestOverride: boolean;

  // Logging
  logProviderSelection: boolean;
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Main LLM configuration
 *
 * Priority order:
 * 1. Per-request override (x-llm-provider header) - if allowPerRequestOverride
 * 2. Internal LLM (if enabled and healthy)
 * 3. Free providers (if allowFallbackToFree)
 * 4. Premium providers (if allowFallbackToPremium)
 * 5. 503 Service Unavailable
 */
export const LLM_CONFIG: LLMConfigType = {
  // Default provider: free providers (Groq/OpenRouter/HuggingFace)
  // Note: 'internal' refers to server-managed free providers, not a separate service
  defaultProvider: (process.env.LLM_PROVIDER || 'free') as ProviderName,

  // Internal/native LLM configuration (disabled by default - optional future feature)
  internal: {
    enabled: parseBoolean(process.env.INTERNAL_LLM_ENABLED, false),
    baseUrl: process.env.INTERNAL_LLM_URL || 'http://localhost:8080',
    apiKey: process.env.INTERNAL_LLM_API_KEY || '',
    model: process.env.INTERNAL_LLM_MODEL || 'default',
    healthCheckUrl: process.env.INTERNAL_LLM_HEALTH_URL || 'http://localhost:8080/health',
    healthCheckIntervalMs: parseInt(process.env.INTERNAL_LLM_HEALTH_INTERVAL || '30000', 10),
    timeoutMs: parseInt(process.env.INTERNAL_LLM_TIMEOUT || '30000', 10),
  },

  // Free external providers (Groq, OpenRouter, HuggingFace)
  free: {
    groq: {
      enabled: !!process.env.GROQ_API_KEY,
      apiKey: process.env.GROQ_API_KEY || '',
    },
    openrouter: {
      enabled: !!process.env.OPENROUTER_API_KEY,
      apiKey: process.env.OPENROUTER_API_KEY || '',
    },
    huggingface: {
      enabled: !!process.env.HUGGINGFACE_API_KEY,
      apiKey: process.env.HUGGINGFACE_API_KEY || '',
      // Multiple models for diversity and load balancing
      models: [
        'meta-llama/Llama-3.3-70B-Instruct',      // High quality - 70B parameters
        'meta-llama/Llama-3.1-8B-Instruct',       // Fast & efficient - 8B parameters
        'Qwen/Qwen2.5-7B-Instruct',               // Excellent for coding - 7B parameters
        'mistralai/Mistral-7B-Instruct-v0.3',     // Good general purpose - 7B parameters
      ],
    },
  },

  // Premium providers (ONLY use if explicitly requested)
  premium: {
    anthropic: {
      enabled: !!process.env.ANTHROPIC_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    },
    openai: {
      enabled: !!process.env.OPENAI_API_KEY,
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    google: {
      enabled: !!process.env.GOOGLE_AI_API_KEY,
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
    },
    perplexity: {
      enabled: !!process.env.PERPLEXITY_API_KEY,
      apiKey: process.env.PERPLEXITY_API_KEY || '',
    },
    grok: {
      enabled: !!process.env.OPENROUTER_API_KEY, // Grok via OpenRouter
      apiKey: process.env.OPENROUTER_API_KEY || '',
    },
  },

  // Fallback behavior
  allowFallbackToFree: parseBoolean(process.env.LLM_ALLOW_FALLBACK_TO_FREE, true),
  allowFallbackToPremium: parseBoolean(process.env.LLM_ALLOW_FALLBACK_TO_PREMIUM, false),
  hardFailOnInternalDown: parseBoolean(process.env.LLM_HARD_FAIL_ON_INTERNAL_DOWN, false), // Changed to false - internal is optional

  // Per-request override
  allowPerRequestOverride: parseBoolean(process.env.LLM_ALLOW_OVERRIDE, true),

  // Logging
  logProviderSelection: parseBoolean(process.env.LLM_LOG_PROVIDER_SELECTION, true),
};

/**
 * Get provider intent from request headers
 */
export function getProviderIntent(headers: Headers): ProviderName | null {
  if (!LLM_CONFIG.allowPerRequestOverride) {
    return null;
  }

  const intent = headers.get('x-llm-provider');
  if (!intent) {
    return null;
  }

  const validProviders: ProviderName[] = ['internal', 'free', 'anthropic', 'openai', 'google', 'perplexity', 'grok'];
  if (validProviders.includes(intent as ProviderName)) {
    return intent as ProviderName;
  }

  return null;
}

/**
 * Generate request ID for correlation
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Log provider selection decision
 */
export function logProviderDecision(params: {
  requestId: string;
  endpoint: string;
  intent: ProviderName | null;
  selected: ProviderName;
  reason: string;
  internalHealthy?: boolean;
  fallbackAllowed?: boolean;
}): void {
  if (!LLM_CONFIG.logProviderSelection) {
    return;
  }

  // Provider selection logging disabled (was debug console.log)
}

/**
 * Validate configuration on startup
 */
export function validateLLMConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // If default is internal, ensure it's configured
  if (LLM_CONFIG.defaultProvider === 'internal' && LLM_CONFIG.internal.enabled) {
    if (!LLM_CONFIG.internal.baseUrl) {
      errors.push('INTERNAL_LLM_URL is required when internal provider is enabled');
    }
  }

  // If default is free, ensure at least one free provider is configured
  if (LLM_CONFIG.defaultProvider === 'free') {
    const hasFreeProvider = Object.values(LLM_CONFIG.free).some(p => p.enabled);
    if (!hasFreeProvider) {
      errors.push('At least one free provider (Groq, OpenRouter, HuggingFace) must be configured');
    }
  }

  // If default is premium, ensure that specific provider is configured
  if (['anthropic', 'openai', 'google', 'perplexity', 'grok'].includes(LLM_CONFIG.defaultProvider)) {
    const providerName = LLM_CONFIG.defaultProvider as keyof typeof LLM_CONFIG.premium;
    if (!LLM_CONFIG.premium[providerName].enabled) {
      errors.push(`${providerName.toUpperCase()}_API_KEY is required when it's the default provider`);
    }
  }

  // Warn if premium keys exist but fallback is not allowed
  const hasPremiumKeys = Object.values(LLM_CONFIG.premium).some(p => p.enabled);
  if (hasPremiumKeys && !LLM_CONFIG.allowFallbackToPremium && LLM_CONFIG.defaultProvider !== 'anthropic') {
    console.warn('[LLM-CONFIG] Premium API keys detected but LLM_ALLOW_FALLBACK_TO_PREMIUM=false. Keys will only be used if explicitly requested via x-llm-provider header.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Validate on module load
const validation = validateLLMConfig();
if (!validation.valid) {
  console.error('[LLM-CONFIG] Configuration errors:', validation.errors);
  // Don't throw - allow server to start but log errors
}

