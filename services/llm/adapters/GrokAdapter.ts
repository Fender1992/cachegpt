/**
 * Grok LLM Adapter
 *
 * Adapter for xAI's Grok models via OpenRouter.
 * Supports streaming, timeouts, and rate limit handling.
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse, StreamChunk } from './types';
import { parseOpenAIStream } from '@/lib/streaming/sse-parser';
import { getDefaultModelId } from '@/lib/models/registry';

const TIMEOUT_MS = 30000;

export class GrokAdapter implements LLMAdapter {
  name = 'grok';
  private apiKey: string;
  private endpoint: string = 'https://openrouter.ai/api/v1/chat/completions';
  private model: string = getDefaultModelId('grok');

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Grok adapter: No API key provided. Set OPENROUTER_API_KEY.');
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const { messages, model, temperature = 0.7, maxTokens = 2000, systemPrompt, qualityMode = 'fast' } = params;

    const formattedMessages = [...messages];
    if (systemPrompt && formattedMessages[0]?.role !== 'system') {
      formattedMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://cachegpt.app',
          'X-Title': 'CacheGPT',
        },
        body: JSON.stringify({
          model: model || this.model,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();

        // Handle rate limit: skip immediately for OpenRouter
        if (response.status === 429) {
          throw new Error(`Grok rate limited: ${errorText.substring(0, 200)}`);
        }

        throw new Error(`Grok API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Grok: No content in response');
      }

      return {
        content: data.choices[0].message.content,
        provider: 'grok',
        model: data.model || model || this.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
        qualityMode,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Grok request timed out');
      }
      throw error;
    }
  }

  async *chatStream(params: LLMChatParams): AsyncGenerator<StreamChunk> {
    const { messages, model, temperature = 0.7, maxTokens = 2000, systemPrompt } = params;

    const formattedMessages = [...messages];
    if (systemPrompt && formattedMessages[0]?.role !== 'system') {
      formattedMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://cachegpt.app',
          'X-Title': 'CacheGPT',
        },
        body: JSON.stringify({
          model: model || this.model,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok streaming error: ${response.status} ${errorText.substring(0, 200)}`);
      }

      for await (const chunk of parseOpenAIStream(response)) {
        if (chunk.content) {
          yield {
            content: chunk.content,
            done: false,
            provider: 'grok',
            model: chunk.model || model || this.model,
          };
        }

        if (chunk.finishReason === 'stop') {
          yield {
            content: '',
            done: true,
            provider: 'grok',
            model: chunk.model || model || this.model,
            usage: chunk.usage ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            } : undefined,
          };
          return;
        }
      }

      yield { content: '', done: true, provider: 'grok', model: model || this.model };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Grok streaming request timed out');
      }
      throw error;
    }
  }
}
