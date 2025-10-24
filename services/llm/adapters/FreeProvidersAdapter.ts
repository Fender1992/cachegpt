/**
 * Free Providers Adapter
 *
 * Adapter for free external providers (Groq, OpenRouter, HuggingFace).
 * Second priority after internal LLM.
 */

import { LLM_CONFIG } from '@/config/llmConfig';
import type { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';

interface ProviderConfig {
  name: string;
  apiKey: string;
  endpoint: string;
  model: string;
}

export class FreeProvidersAdapter implements LLMAdapter {
  name = 'free';

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const { messages, temperature, maxTokens, systemPrompt, qualityMode = 'fast' } = params;

    // Prepare messages with system prompt
    const messagesWithSystem = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    // Route to appropriate method based on quality mode
    if (qualityMode === 'best') {
      return this.chatWithSelfMoA(messagesWithSystem, temperature, maxTokens);
    } else {
      return this.chatFastMode(messagesWithSystem, temperature, maxTokens);
    }
  }

  /**
   * Fast Mode: First-success failover (original behavior)
   */
  private async chatFastMode(
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMChatResponse> {
    const providers = this.getProviders();

    // Shuffle providers for load balancing
    const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

    console.log('[FREE-PROVIDER] Fast mode - Load balancing order:', shuffledProviders.map(p => p.name).join(' -> '));

    // Try each provider
    for (const provider of shuffledProviders) {
      try {
        const result = await this.callProvider(provider, messages, temperature, maxTokens);
        return { ...result, qualityMode: 'fast' };
      } catch (error: any) {
        console.error(`[FREE-PROVIDER] ${provider.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All free providers failed');
  }

  /**
   * Best Mode: Self-MoA - Query 3 diverse models + aggregate
   */
  private async chatWithSelfMoA(
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMChatResponse> {
    const providers = this.getProviders();

    if (providers.length < 3) {
      console.warn('[FREE-PROVIDER] Not enough providers for Self-MoA, falling back to fast mode');
      return this.chatFastMode(messages, temperature, maxTokens);
    }

    console.log('[FREE-PROVIDER] Best mode - Using Self-MoA with 3 diverse models');

    // Select 3 diverse providers (prefer different model sizes)
    const selectedProviders = this.selectDiverseProviders(providers, 3);

    // Query all 3 in parallel with different temperatures for diversity
    const temperatures = [0.9, 0.7, 0.5]; // creative, balanced, focused
    const responsePromises = selectedProviders.map((provider, index) =>
      this.callProvider(provider, messages, temperatures[index], maxTokens)
        .then(response => ({ success: true, response, provider: provider.name }))
        .catch(error => ({ success: false, error: error.message, provider: provider.name }))
    );

    const results = await Promise.all(responsePromises);
    const successfulResults = results.filter(r => r.success) as Array<{ success: true; response: LLMChatResponse; provider: string }>;

    if (successfulResults.length === 0) {
      console.error('[FREE-PROVIDER] All Self-MoA providers failed, trying fast mode fallback');
      return this.chatFastMode(messages, temperature, maxTokens);
    }

    console.log(`[FREE-PROVIDER] Self-MoA: ${successfulResults.length}/${selectedProviders.length} responses successful`);

    // If only 1 response, return it directly
    if (successfulResults.length === 1) {
      return { ...successfulResults[0].response, qualityMode: 'best' };
    }

    // Aggregate multiple responses
    const aggregationPrompt = this.buildAggregationPrompt(successfulResults, messages);

    // Use fastest provider (Groq) for aggregation
    const aggregator = providers.find(p => p.name === 'groq') || providers[0];

    try {
      const aggregatedResponse = await this.callProvider(aggregator, aggregationPrompt, 0.3, maxTokens);

      return {
        content: aggregatedResponse.content,
        provider: 'self-moa',
        model: 'aggregated',
        qualityMode: 'best',
        aggregatedFrom: successfulResults.map(r => `${r.provider}(${r.response.model})`),
        usage: {
          promptTokens: successfulResults.reduce((sum, r) => sum + (r.response.usage?.promptTokens || 0), 0),
          completionTokens: successfulResults.reduce((sum, r) => sum + (r.response.usage?.completionTokens || 0), 0),
          totalTokens: successfulResults.reduce((sum, r) => sum + (r.response.usage?.totalTokens || 0), 0),
        },
      };
    } catch (error: any) {
      console.error('[FREE-PROVIDER] Aggregation failed, returning best individual response');
      // Return the first successful response if aggregation fails
      return { ...successfulResults[0].response, qualityMode: 'best' };
    }
  }

  /**
   * Get all available providers
   */
  private getProviders(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];

    if (LLM_CONFIG.free.groq.enabled) {
      providers.push({
        name: 'groq',
        apiKey: LLM_CONFIG.free.groq.apiKey,
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.3-70b-versatile',
      });
    }

    if (LLM_CONFIG.free.openrouter.enabled) {
      providers.push({
        name: 'openrouter',
        apiKey: LLM_CONFIG.free.openrouter.apiKey,
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'meta-llama/llama-4-maverick:free',
      });
    }

    if (LLM_CONFIG.free.huggingface.enabled) {
      const hfModels = LLM_CONFIG.free.huggingface.models || ['meta-llama/Llama-3.3-70B-Instruct'];

      hfModels.forEach((model, index) => {
        providers.push({
          name: `huggingface-${index + 1}`,
          apiKey: LLM_CONFIG.free.huggingface.apiKey,
          endpoint: 'https://router.huggingface.co/v1/chat/completions',
          model: model,
        });
      });
    }

    if (providers.length === 0) {
      throw new Error('No free providers configured');
    }

    return providers;
  }

  /**
   * Select diverse providers (prefer different model sizes)
   */
  private selectDiverseProviders(providers: ProviderConfig[], count: number): ProviderConfig[] {
    // Prioritize diversity: 1 large model (70B), 1 medium (8B), 1 small (7B)
    const large = providers.find(p => p.model.includes('70') || p.name === 'groq');
    const medium = providers.find(p => p.model.includes('8B'));
    const small = providers.find(p => p.model.includes('7B') || p.model.includes('Qwen'));

    const selected: ProviderConfig[] = [];
    if (large) selected.push(large);
    if (medium) selected.push(medium);
    if (small && !selected.includes(small)) selected.push(small);

    // Fill remaining slots with random providers
    while (selected.length < count && selected.length < providers.length) {
      const remaining = providers.filter(p => !selected.includes(p));
      if (remaining.length === 0) break;
      selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }

    return selected.slice(0, count);
  }

  /**
   * Build aggregation prompt from multiple responses
   */
  private buildAggregationPrompt(
    results: Array<{ response: LLMChatResponse; provider: string }>,
    originalMessages: any[]
  ): any[] {
    const lastUserMessage = originalMessages.filter(m => m.role === 'user').pop()?.content || 'the question';

    const responsesText = results.map((r, i) =>
      `Response ${i + 1} (from ${r.provider} using ${r.response.model}):\n${r.response.content}`
    ).join('\n\n---\n\n');

    const aggregationMessage = {
      role: 'user' as const,
      content: `You are an expert response aggregator. You have received ${results.length} different AI responses to the following question:

"${lastUserMessage}"

Here are the responses:

${responsesText}

Your task is to synthesize these responses into a single, superior answer that:
1. Combines the best insights from all responses
2. Resolves any contradictions by identifying the most accurate information
3. Eliminates redundancy while preserving unique valuable points
4. Presents information in a clear, well-structured format
5. Maintains accuracy and doesn't introduce new unsupported claims

Provide only the synthesized response, without meta-commentary about the aggregation process.`
    };

    return [aggregationMessage];
  }

  private async callProvider(
    provider: ProviderConfig,
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMChatResponse> {
    let body: any;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    };

    // All providers now use OpenAI-compatible format
    body = {
      model: provider.model,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 1000,
    };

    // Provider-specific headers
    if (provider.name === 'openrouter') {
      headers['HTTP-Referer'] = 'https://cachegpt.app';
      headers['X-Title'] = 'CacheGPT';
    }

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      throw new Error(`${provider.name} API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    // All providers now use OpenAI-compatible format
    const content = data.choices?.[0]?.message?.content || 'No response';

    return {
      content,
      provider: provider.name,
      model: provider.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}
