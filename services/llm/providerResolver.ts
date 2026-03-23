/**
 * LLM Provider Resolver
 *
 * Determines which LLM provider to use based on configuration and runtime conditions.
 *
 * Priority order:
 * 1. Per-request override (x-llm-provider header) - if allowed
 * 2. Internal LLM (if enabled and healthy)
 * 3. Free providers (if fallback allowed)
 * 4. Premium providers (if fallback allowed)
 * 5. 503 Service Unavailable
 *
 * IMPORTANT: Presence of ANTHROPIC_API_KEY does NOT change default behavior.
 */

import { LLM_CONFIG, ProviderName, generateRequestId, logProviderDecision, getProviderIntent } from '@/config/llmConfig';
import { internalLLMHealthChecker } from './healthCheck';

export interface ProviderResolutionRequest {
  headers?: Headers;
  requestId?: string;
  endpoint?: string;
  model?: string; // Requested model name — used to route to correct provider
  userApiKey?: string | null; // If user has their own provider key stored
  userProvider?: string | null; // Which provider the user key is for
}

export interface ProviderResolutionResult {
  provider: ProviderName;
  reason: string;
  requestId: string;
  useUserKey: boolean; // If true, use userApiKey instead of server key
}

export class ProviderResolutionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public requestId: string
  ) {
    super(message);
    this.name = 'ProviderResolutionError';
  }
}

/**
 * Resolve which provider to use for a request
 */
export async function resolveProvider(request: ProviderResolutionRequest): Promise<ProviderResolutionResult> {
  const requestId = request.requestId || generateRequestId();
  const endpoint = request.endpoint || '/api/unknown';

  // Step 1: Check for per-request override via x-llm-provider header
  const overrideIntent = request.headers ? getProviderIntent(request.headers) : null;

  if (overrideIntent) {
    // Validate the override is available
    const isValid = await validateProviderIntent(overrideIntent);

    if (!isValid) {
      logProviderDecision({
        requestId,
        endpoint,
        intent: overrideIntent,
        selected: 'none' as ProviderName,
        reason: `Override provider '${overrideIntent}' not available (check API keys)`,
      });

      throw new ProviderResolutionError(
        `Requested provider '${overrideIntent}' is not available. Please check configuration.`,
        503,
        requestId
      );
    }

    logProviderDecision({
      requestId,
      endpoint,
      intent: overrideIntent,
      selected: overrideIntent,
      reason: 'Per-request override via x-llm-provider header',
    });

    return {
      provider: overrideIntent,
      reason: 'Per-request override',
      requestId,
      useUserKey: false,
    };
  }

  // Step 2: Check if user has their own API key stored
  if (request.userApiKey && request.userProvider) {
    const userProviderName = mapUserProviderToProviderName(request.userProvider);

    logProviderDecision({
      requestId,
      endpoint,
      intent: null,
      selected: userProviderName,
      reason: 'User has stored API key for this provider',
    });

    return {
      provider: userProviderName,
      reason: 'User stored API key',
      requestId,
      useUserKey: true,
    };
  }

  // Step 2.5: Model-aware routing — if the requested model belongs to a premium
  // provider and that provider is configured, route directly to it.
  // This ensures "claude-sonnet-4-6" → anthropic, "gpt-4o" → openai, etc.
  if (request.model) {
    const modelProvider = inferProviderFromModel(request.model);
    if (modelProvider && await validateProviderIntent(modelProvider)) {
      logProviderDecision({
        requestId,
        endpoint,
        intent: null,
        selected: modelProvider,
        reason: `Model "${request.model}" mapped to provider "${modelProvider}"`,
      });

      return {
        provider: modelProvider,
        reason: `Model-aware routing: ${request.model} → ${modelProvider}`,
        requestId,
        useUserKey: false,
      };
    }
  }

  // Step 3: Try internal LLM (if enabled)
  if (LLM_CONFIG.internal.enabled) {
    const internalHealthy = await internalLLMHealthChecker.isHealthy();

    if (internalHealthy) {
      logProviderDecision({
        requestId,
        endpoint,
        intent: null,
        selected: 'internal',
        reason: 'Internal LLM is enabled and healthy',
        internalHealthy: true,
      });

      return {
        provider: 'internal',
        reason: 'Internal LLM healthy',
        requestId,
        useUserKey: false,
      };
    }

    // Internal is enabled but not healthy
    if (LLM_CONFIG.hardFailOnInternalDown) {
      logProviderDecision({
        requestId,
        endpoint,
        intent: null,
        selected: 'none' as ProviderName,
        reason: 'Internal LLM is down and hard-fail is enabled',
        internalHealthy: false,
        fallbackAllowed: false,
      });

      throw new ProviderResolutionError(
        'Internal LLM service is unavailable. Please try again later.',
        503,
        requestId
      );
    }

    console.warn(`[PROVIDER-RESOLVER] Internal LLM is unhealthy, attempting fallback (request ${requestId})`);
  }

  // Step 4: Try free providers (if fallback allowed)
  if (LLM_CONFIG.allowFallbackToFree) {
    const hasFreeProvider = Object.values(LLM_CONFIG.free).some(p => p.enabled);

    if (hasFreeProvider) {
      logProviderDecision({
        requestId,
        endpoint,
        intent: null,
        selected: 'free',
        reason: 'Fallback to free providers (internal unavailable)',
        internalHealthy: false,
        fallbackAllowed: true,
      });

      return {
        provider: 'free',
        reason: 'Fallback to free providers',
        requestId,
        useUserKey: false,
      };
    }
  }

  // Step 5: Try premium providers (if fallback allowed)
  if (LLM_CONFIG.allowFallbackToPremium) {
    // Prefer Anthropic, then OpenAI, then Google, then Perplexity
    const premiumPriority: Array<keyof typeof LLM_CONFIG.premium> = ['anthropic', 'openai', 'google', 'perplexity'];

    for (const providerKey of premiumPriority) {
      if (LLM_CONFIG.premium[providerKey].enabled) {
        logProviderDecision({
          requestId,
          endpoint,
          intent: null,
          selected: providerKey,
          reason: 'Fallback to premium provider (internal and free unavailable)',
          internalHealthy: false,
          fallbackAllowed: true,
        });

        return {
          provider: providerKey,
          reason: 'Fallback to premium provider',
          requestId,
          useUserKey: false,
        };
      }
    }
  }

  // Step 6: No providers available - return 503
  logProviderDecision({
    requestId,
    endpoint,
    intent: null,
    selected: 'none' as ProviderName,
    reason: 'No providers available',
    internalHealthy: false,
    fallbackAllowed: false,
  });

  throw new ProviderResolutionError(
    'No LLM providers are available. Please contact support or configure provider API keys.',
    503,
    requestId
  );
}

/**
 * Validate that a provider is available
 */
async function validateProviderIntent(provider: ProviderName): Promise<boolean> {
  switch (provider) {
    case 'internal':
      return LLM_CONFIG.internal.enabled && await internalLLMHealthChecker.isHealthy();

    case 'free':
      return Object.values(LLM_CONFIG.free).some(p => p.enabled);

    case 'anthropic':
      return LLM_CONFIG.premium.anthropic.enabled;

    case 'openai':
      return LLM_CONFIG.premium.openai.enabled;

    case 'google':
      return LLM_CONFIG.premium.google.enabled;

    case 'perplexity':
      return LLM_CONFIG.premium.perplexity.enabled;

    default:
      return false;
  }
}

/**
 * Map user provider names (from database) to ProviderName
 */
function mapUserProviderToProviderName(userProvider: string): ProviderName {
  const mapping: Record<string, ProviderName> = {
    'chatgpt': 'openai',
    'claude': 'anthropic',
    'gemini': 'google',
    'openai': 'openai',
    'anthropic': 'anthropic',
    'google': 'google',
    'perplexity': 'perplexity',
  };

  return mapping[userProvider] || 'anthropic'; // Default fallback
}

/**
 * Infer the correct provider from a model name.
 * Returns null if the model doesn't map to a known premium provider.
 */
function inferProviderFromModel(model: string): ProviderName | null {
  const m = model.toLowerCase();

  // Anthropic models
  if (m.startsWith('claude-') || m.includes('claude')) return 'anthropic';

  // OpenAI models
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai';

  // Google models
  if (m.startsWith('gemini-')) return 'google';

  // Perplexity models
  if (m.startsWith('pplx-') || m.startsWith('sonar')) return 'perplexity';

  // Groq models (route to free)
  if (m.startsWith('llama-') || m.includes('groq')) return 'free';

  return null;
}

/**
 * Create provider resolution error response
 */
export function createProviderErrorResponse(error: ProviderResolutionError) {
  return {
    error: error.message,
    code: 'PROVIDER_UNAVAILABLE',
    requestId: error.requestId,
    hint: error.statusCode === 503
      ? 'Check LLM provider configuration or try again later'
      : 'Contact support if this persists',
  };
}
