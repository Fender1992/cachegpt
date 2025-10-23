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
    const { messages, temperature, maxTokens, systemPrompt } = params;

    // Prepare messages with system prompt
    const messagesWithSystem = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    // Get available providers
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
      providers.push({
        name: 'huggingface',
        apiKey: LLM_CONFIG.free.huggingface.apiKey,
        endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
        model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      });
    }

    if (providers.length === 0) {
      throw new Error('No free providers configured');
    }

    // Shuffle providers for load balancing
    const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

    console.log('[FREE-PROVIDER] Load balancing order:', shuffledProviders.map(p => p.name).join(' -> '));

    // Try each provider
    for (const provider of shuffledProviders) {
      try {
        const result = await this.callProvider(provider, messagesWithSystem, temperature, maxTokens);
        return result;
      } catch (error: any) {
        console.error(`[FREE-PROVIDER] ${provider.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All free providers failed');
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

    if (provider.name === 'huggingface') {
      body = {
        inputs: messages.map(m => m.content).join('\n'),
        parameters: {
          max_new_tokens: maxTokens || 1000,
          temperature: temperature ?? 0.7,
        },
      };
    } else {
      body = {
        model: provider.model,
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens || 1000,
      };

      if (provider.name === 'openrouter') {
        headers['HTTP-Referer'] = 'https://cachegpt.app';
        headers['X-Title'] = 'CacheGPT';
      }
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
    let content: string;

    if (provider.name === 'huggingface') {
      content = data[0]?.generated_text || data.generated_text || 'No response';
    } else {
      content = data.choices?.[0]?.message?.content || 'No response';
    }

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
