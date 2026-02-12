/**
 * Free Providers Adapter
 *
 * Adapter for free external providers (Groq, OpenRouter, HuggingFace).
 * Supports streaming, timeouts, rate limit awareness, and Self-MoA quality mode.
 */

import { LLM_CONFIG } from '@/config/llmConfig';
import type { LLMAdapter, LLMChatParams, LLMChatResponse, StreamChunk } from './types';
import { parseOpenAIStream } from '@/lib/streaming/sse-parser';
import { getDefaultModelId } from '@/lib/models/registry';

const TIMEOUT_MS = 30000;

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

    const messagesWithSystem = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    if (qualityMode === 'best') {
      return this.chatWithSelfMoA(messagesWithSystem, temperature, maxTokens);
    }
    return this.chatFastMode(messagesWithSystem, temperature, maxTokens);
  }

  async *chatStream(params: LLMChatParams): AsyncGenerator<StreamChunk> {
    const providers = this.getProviders();
    const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

    const messagesWithSystem = params.systemPrompt
      ? [{ role: 'system' as const, content: params.systemPrompt }, ...params.messages]
      : params.messages;

    // Try each provider until one streams successfully
    for (const provider of shuffledProviders) {
      try {
        yield* this.streamFromProvider(provider, messagesWithSystem, params.temperature, params.maxTokens);
        return; // Success — exit after first working provider
      } catch (error: any) {
        console.error(`[FREE-PROVIDER] ${provider.name} streaming failed:`, error.message);
        continue;
      }
    }

    throw new Error('All free providers failed to stream');
  }

  private async *streamFromProvider(
    provider: ProviderConfig,
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): AsyncGenerator<StreamChunk> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    };

    if (provider.name === 'openrouter') {
      headers['HTTP-Referer'] = 'https://cachegpt.app';
      headers['X-Title'] = 'CacheGPT';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens || 1000,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
        throw new Error(`${provider.name} streaming error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      for await (const chunk of parseOpenAIStream(response)) {
        if (chunk.content) {
          yield {
            content: chunk.content,
            done: false,
            provider: provider.name,
            model: chunk.model || provider.model,
          };
        }

        if (chunk.finishReason === 'stop') {
          yield {
            content: '',
            done: true,
            provider: provider.name,
            model: chunk.model || provider.model,
            usage: chunk.usage ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            } : undefined,
          };
          return;
        }
      }

      yield { content: '', done: true, provider: provider.name, model: provider.model };
    } catch (error: any) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Fast Mode: First-success failover
   */
  private async chatFastMode(
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMChatResponse> {
    const providers = this.getProviders();
    const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

    for (const provider of shuffledProviders) {
      try {
        const result = await this.callProvider(provider, messages, temperature, maxTokens);
        return { ...result, qualityMode: 'fast' };
      } catch (error: any) {
        // On rate limit, skip immediately to next provider
        if (error.message?.includes('429')) {
          continue;
        }
        continue;
      }
    }

    throw new Error('All free providers failed');
  }

  /**
   * Best Mode: Self-MoA — Query 3 diverse models + aggregate
   */
  private async chatWithSelfMoA(
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMChatResponse> {
    const providers = this.getProviders();

    if (providers.length < 3) {
      return this.chatFastMode(messages, temperature, maxTokens);
    }

    const selectedProviders = this.selectDiverseProviders(providers, 3);
    const temperatures = [0.9, 0.7, 0.5];
    const responsePromises = selectedProviders.map((provider, index) =>
      this.callProvider(provider, messages, temperatures[index], maxTokens)
        .then(response => ({ success: true as const, response, provider: provider.name }))
        .catch(error => ({ success: false as const, error: error.message, provider: provider.name }))
    );

    const results = await Promise.all(responsePromises);
    const successfulResults = results.filter((r): r is { success: true; response: LLMChatResponse; provider: string } => r.success);

    if (successfulResults.length === 0) {
      return this.chatFastMode(messages, temperature, maxTokens);
    }

    if (successfulResults.length === 1) {
      return { ...successfulResults[0].response, qualityMode: 'best' };
    }

    // Aggregate multiple responses
    const aggregationPrompt = this.buildAggregationPrompt(successfulResults, messages);
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
    } catch {
      return { ...successfulResults[0].response, qualityMode: 'best' };
    }
  }

  private getProviders(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];

    if (LLM_CONFIG.free.groq.enabled) {
      providers.push({
        name: 'groq',
        apiKey: LLM_CONFIG.free.groq.apiKey,
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        model: getDefaultModelId('groq'),
      });
    }

    if (LLM_CONFIG.free.openrouter.enabled) {
      providers.push({
        name: 'openrouter',
        apiKey: LLM_CONFIG.free.openrouter.apiKey,
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        model: getDefaultModelId('openrouter'),
      });
    }

    if (LLM_CONFIG.free.huggingface.enabled) {
      const hfModels = LLM_CONFIG.free.huggingface.models || [getDefaultModelId('huggingface')];
      hfModels.forEach((model, index) => {
        providers.push({
          name: `huggingface-${index + 1}`,
          apiKey: LLM_CONFIG.free.huggingface.apiKey,
          endpoint: 'https://router.huggingface.co/v1/chat/completions',
          model,
        });
      });
    }

    if (providers.length === 0) {
      throw new Error('No free providers configured');
    }

    return providers;
  }

  private selectDiverseProviders(providers: ProviderConfig[], count: number): ProviderConfig[] {
    const large = providers.find(p => p.model.includes('70') || p.name === 'groq');
    const medium = providers.find(p => p.model.includes('8B'));
    const small = providers.find(p => p.model.includes('7B') || p.model.includes('Qwen'));

    const selected: ProviderConfig[] = [];
    if (large) selected.push(large);
    if (medium) selected.push(medium);
    if (small && !selected.includes(small)) selected.push(small);

    while (selected.length < count && selected.length < providers.length) {
      const remaining = providers.filter(p => !selected.includes(p));
      if (remaining.length === 0) break;
      selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }

    return selected.slice(0, count);
  }

  private buildAggregationPrompt(
    results: Array<{ response: LLMChatResponse; provider: string }>,
    originalMessages: any[]
  ): any[] {
    const lastUserMessage = originalMessages.filter(m => m.role === 'user').pop()?.content || 'the question';
    const responsesText = results.map((r, i) =>
      `Response ${i + 1} (from ${r.provider} using ${r.response.model}):\n${r.response.content}`
    ).join('\n\n---\n\n');

    return [{
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
    }];
  }

  private async callProvider(
    provider: ProviderConfig,
    messages: any[],
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMChatResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    };

    if (provider.name === 'openrouter') {
      headers['HTTP-Referer'] = 'https://cachegpt.app';
      headers['X-Title'] = 'CacheGPT';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens || 1000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');

        // On 429, throw immediately so caller can skip to next provider
        if (response.status === 429) {
          throw new Error(`${provider.name} rate limited (429)`);
        }

        throw new Error(`${provider.name} API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
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
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error(`${provider.name} request timed out`);
      }
      throw error;
    }
  }
}
