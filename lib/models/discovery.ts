/**
 * Provider Discovery Service
 *
 * Queries each provider's model list API to discover available models.
 * Replaces the hardcoded fetchLatestModels() in app/api/model-updates/route.ts.
 */

import { LLM_CONFIG } from '@/config/llmConfig';

export interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  createdAt?: string;
  ownedBy?: string;
  supportsStreaming: boolean;
  supportsVision: boolean;
  pricing?: { inputPerMillion?: number; outputPerMillion?: number };
}

const DISCOVERY_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Hardcoded known models for providers without a list API
// ---------------------------------------------------------------------------

const ANTHROPIC_KNOWN_MODELS: DiscoveredModel[] = [
  {
    id: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
  },
];

const PERPLEXITY_KNOWN_MODELS: DiscoveredModel[] = [
  {
    id: 'llama-3.1-sonar-huge-128k-online',
    name: 'Sonar Huge 128K Online',
    provider: 'perplexity',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Provider-specific discovery implementations
// ---------------------------------------------------------------------------

async function discoverOpenAI(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: timeoutSignal(DISCOVERY_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`OpenAI API ${res.status}`);

  const json = await res.json();
  const models: any[] = json.data ?? [];

  return models
    .filter(
      (m: any) =>
        typeof m.owned_by === 'string' &&
        (m.owned_by.includes('openai') || m.owned_by === 'system')
    )
    .sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0))
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      provider: 'openai',
      createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
      ownedBy: m.owned_by,
      supportsStreaming: true,
      supportsVision: m.id.includes('vision') || m.id.includes('gpt-4'),
    }));
}

async function discoverGroq(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: timeoutSignal(DISCOVERY_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Groq API ${res.status}`);

  const json = await res.json();
  const models: any[] = json.data ?? [];

  return models
    .sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0))
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      provider: 'groq',
      createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
      ownedBy: m.owned_by,
      contextWindow: m.context_window,
      supportsStreaming: true,
      supportsVision: false,
    }));
}

async function discoverOpenRouter(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: timeoutSignal(DISCOVERY_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);

  const json = await res.json();
  const models: any[] = json.data ?? [];

  return models.map((m: any) => ({
    id: m.id,
    name: m.name ?? m.id,
    provider: 'openrouter',
    contextWindow: m.context_length,
    maxOutputTokens: m.top_provider?.max_completion_tokens,
    supportsStreaming: true,
    supportsVision: m.architecture?.modality?.includes('image') ?? false,
    pricing:
      m.pricing?.prompt != null
        ? {
            inputPerMillion: parseFloat(m.pricing.prompt) * 1_000_000,
            outputPerMillion: parseFloat(m.pricing.completion) * 1_000_000,
          }
        : undefined,
  }));
}

async function discoverGoogle(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { signal: timeoutSignal(DISCOVERY_TIMEOUT_MS) },
  );

  if (!res.ok) throw new Error(`Google AI API ${res.status}`);

  const json = await res.json();
  const models: any[] = json.models ?? [];

  return models
    .filter(
      (m: any) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent'),
    )
    .map((m: any) => ({
      id: m.name?.replace('models/', '') ?? m.name,
      name: m.displayName ?? m.name,
      provider: 'google',
      contextWindow: m.inputTokenLimit,
      maxOutputTokens: m.outputTokenLimit,
      supportsStreaming: true,
      supportsVision:
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent'),
    }));
}

async function discoverHuggingFace(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch(
    'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=likes&limit=20',
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: timeoutSignal(DISCOVERY_TIMEOUT_MS),
    },
  );

  if (!res.ok) throw new Error(`HuggingFace API ${res.status}`);

  const models: any[] = await res.json();

  return models
    .filter((m: any) => {
      const name = (m.id ?? '').toLowerCase();
      return name.includes('instruct') || name.includes('chat');
    })
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      provider: 'huggingface',
      createdAt: m.createdAt,
      ownedBy: m.author,
      supportsStreaming: true,
      supportsVision: false,
    }));
}

function discoverAnthropic(): DiscoveredModel[] {
  return ANTHROPIC_KNOWN_MODELS;
}

function discoverPerplexity(): DiscoveredModel[] {
  return PERPLEXITY_KNOWN_MODELS;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover models for a single provider.
 *
 * Returns an empty array (and logs an error) when discovery fails,
 * so one provider's failure never blocks the rest.
 */
export async function discoverModels(
  provider: string,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  try {
    switch (provider) {
      case 'openai':
        return await discoverOpenAI(apiKey);
      case 'groq':
        return await discoverGroq(apiKey);
      case 'openrouter':
        return await discoverOpenRouter(apiKey);
      case 'google':
        return await discoverGoogle(apiKey);
      case 'huggingface':
        return await discoverHuggingFace(apiKey);
      case 'anthropic':
        return discoverAnthropic();
      case 'perplexity':
        return discoverPerplexity();
      default:
        console.warn(`[discovery] Unknown provider: ${provider}`);
        return [];
    }
  } catch (err) {
    console.error(`[discovery] Failed to discover models for ${provider}:`, err);
    return [];
  }
}

/**
 * Discover models across all configured providers in parallel.
 *
 * Reads API keys from LLM_CONFIG. Each provider runs independently —
 * individual failures are logged but never block the other providers.
 */
export async function discoverAllModels(
  apiKeys?: Record<string, string>,
): Promise<Record<string, DiscoveredModel[]>> {
  const keys: Record<string, string> = apiKeys ?? {
    openai: LLM_CONFIG.premium.openai.apiKey,
    anthropic: LLM_CONFIG.premium.anthropic.apiKey,
    google: LLM_CONFIG.premium.google.apiKey,
    perplexity: LLM_CONFIG.premium.perplexity.apiKey,
    groq: LLM_CONFIG.free.groq.apiKey,
    openrouter: LLM_CONFIG.free.openrouter.apiKey,
    huggingface: LLM_CONFIG.free.huggingface.apiKey,
  };

  const providers = Object.keys(keys).filter((p) => keys[p]);

  const entries = await Promise.all(
    providers.map(async (provider) => {
      const models = await discoverModels(provider, keys[provider]);
      return [provider, models] as const;
    }),
  );

  return Object.fromEntries(entries);
}
