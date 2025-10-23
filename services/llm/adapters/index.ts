/**
 * LLM Adapter Factory
 *
 * Creates appropriate adapter based on provider name.
 */

import type { ProviderName } from '@/config/llmConfig';
import type { LLMAdapter } from './types';
import { InternalAdapter } from './InternalAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { FreeProvidersAdapter } from './FreeProvidersAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { GoogleAdapter } from './GoogleAdapter';
import { PerplexityAdapter } from './PerplexityAdapter';

export * from './types';

/**
 * Create adapter for a given provider
 */
export function createAdapter(provider: ProviderName, userApiKey?: string): LLMAdapter {
  switch (provider) {
    case 'internal':
      return new InternalAdapter();

    case 'free':
      return new FreeProvidersAdapter();

    case 'anthropic':
      return new AnthropicAdapter(userApiKey);

    case 'openai':
      return new OpenAIAdapter(userApiKey);

    case 'google':
      return new GoogleAdapter(userApiKey);

    case 'perplexity':
      return new PerplexityAdapter(userApiKey);

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
