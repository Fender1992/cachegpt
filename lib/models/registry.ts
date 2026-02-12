/**
 * Centralized Model Registry
 *
 * Single source of truth for all LLM model metadata.
 * Synchronous API — uses in-memory data so adapters can call it without await.
 */

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  tier: 'fast' | 'balanced' | 'premium';
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsFunctions: boolean;
  costPerMillionInput?: number;
  costPerMillionOutput?: number;
  isDefault: boolean;
  isActive: boolean;
  lastVerified: string; // ISO date
}

const LAST_VERIFIED = '2025-09-25';

const DEFAULT_MODELS: ModelEntry[] = [
  // ── OpenAI ──────────────────────────────────────────────
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'balanced',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 2.5,
    costPerMillionOutput: 10,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'fast',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 0.15,
    costPerMillionOutput: 0.6,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    tier: 'premium',
    maxContextTokens: 256000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 5,
    costPerMillionOutput: 15,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── Anthropic ───────────────────────────────────────────
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    tier: 'balanced',
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 3,
    costPerMillionOutput: 15,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    tier: 'fast',
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 0.25,
    costPerMillionOutput: 1.25,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    tier: 'premium',
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 15,
    costPerMillionOutput: 75,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── Google ──────────────────────────────────────────────
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    tier: 'fast',
    maxContextTokens: 1000000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 0.075,
    costPerMillionOutput: 0.3,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'gemini-2.0-pro',
    name: 'Gemini 2.0 Pro',
    provider: 'google',
    tier: 'balanced',
    maxContextTokens: 2000000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 1.25,
    costPerMillionOutput: 5,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'gemini-2.0-ultra',
    name: 'Gemini 2.0 Ultra',
    provider: 'google',
    tier: 'premium',
    maxContextTokens: 5000000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctions: true,
    costPerMillionInput: 5,
    costPerMillionOutput: 15,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── Perplexity ──────────────────────────────────────────
  {
    id: 'llama-3.1-sonar-huge-128k-online',
    name: 'Sonar Huge 128k Online',
    provider: 'perplexity',
    tier: 'balanced',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: false,
    costPerMillionInput: 5,
    costPerMillionOutput: 5,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    tier: 'fast',
    maxContextTokens: 32768,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: false,
    costPerMillionInput: 3,
    costPerMillionOutput: 15,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'pplx-pro-online',
    name: 'Perplexity Pro Online',
    provider: 'perplexity',
    tier: 'premium',
    maxContextTokens: 32768,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: false,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── Groq ────────────────────────────────────────────────
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    tier: 'balanced',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: true,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'groq',
    tier: 'fast',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: false,
    isDefault: false,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── OpenRouter ──────────────────────────────────────────
  {
    id: 'meta-llama/llama-4-maverick:free',
    name: 'Llama 4 Maverick (Free)',
    provider: 'openrouter',
    tier: 'balanced',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: false,
    costPerMillionInput: 0,
    costPerMillionOutput: 0,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── HuggingFace ─────────────────────────────────────────
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B Instruct',
    provider: 'huggingface',
    tier: 'balanced',
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: false,
    costPerMillionInput: 0,
    costPerMillionOutput: 0,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },

  // ── Grok ────────────────────────────────────────────────
  {
    id: 'x-ai/grok-2-1212',
    name: 'Grok 2',
    provider: 'grok',
    tier: 'balanced',
    maxContextTokens: 131072,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctions: true,
    isDefault: true,
    isActive: true,
    lastVerified: LAST_VERIFIED,
  },
];

// Fallback defaults keyed by provider — used when nothing else matches
const FALLBACK_MODEL_IDS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
  google: 'gemini-2.0-flash-exp',
  perplexity: 'llama-3.1-sonar-huge-128k-online',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-4-maverick:free',
  huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
  grok: 'x-ai/grok-2-1212',
};

const FALLBACK_MAX_OUTPUT = 4096;

export class ModelRegistry {
  private models: ModelEntry[];

  constructor() {
    this.models = [...DEFAULT_MODELS];
  }

  /**
   * Look up a single model. When tier is omitted, returns the provider default.
   */
  getModel(provider: string, tier?: string): ModelEntry | null {
    const providerModels = this.models.filter(
      (m) => m.provider === provider && m.isActive
    );
    if (providerModels.length === 0) return null;

    if (tier) {
      return providerModels.find((m) => m.tier === tier) ?? null;
    }

    return (
      providerModels.find((m) => m.isDefault) ?? providerModels[0] ?? null
    );
  }

  /**
   * Return the default model ID string for a provider.
   */
  getDefaultModel(provider: string): string {
    const entry = this.getModel(provider);
    if (entry) return entry.id;
    return FALLBACK_MODEL_IDS[provider] ?? 'unknown';
  }

  /**
   * List all active models, optionally filtered by provider.
   */
  getAllModels(provider?: string): ModelEntry[] {
    if (provider) {
      return this.models.filter(
        (m) => m.provider === provider && m.isActive
      );
    }
    return this.models.filter((m) => m.isActive);
  }

  /**
   * Bulk-replace the model list (used by the discovery service).
   * Falls back to hardcoded defaults if the incoming list is empty.
   */
  updateModels(models: ModelEntry[]): void {
    if (!models || models.length === 0) {
      console.warn('[ModelRegistry] updateModels called with empty list — keeping defaults');
      return;
    }
    this.models = models;
  }

  /**
   * Max output tokens for a specific model or the provider default.
   */
  getModelMaxOutputTokens(provider: string, modelId?: string): number {
    if (modelId) {
      const entry = this.models.find(
        (m) => m.id === modelId && m.isActive
      );
      if (entry) return entry.maxOutputTokens;
    }

    const defaultEntry = this.getModel(provider);
    return defaultEntry?.maxOutputTokens ?? FALLBACK_MAX_OUTPUT;
  }
}

// ── Singleton & convenience exports ──────────────────────

export const modelRegistry = new ModelRegistry();

export function getDefaultModelId(provider: string): string {
  return modelRegistry.getDefaultModel(provider);
}

export function getModelMaxOutput(provider: string, modelId?: string): number {
  return modelRegistry.getModelMaxOutputTokens(provider, modelId);
}
