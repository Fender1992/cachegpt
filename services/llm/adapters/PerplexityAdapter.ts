/**
 * Perplexity Adapter
 *
 * Adapter for Perplexity AI models (with online search capabilities).
 * Supports streaming, retries, rate limit handling, and timeouts.
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse, StreamChunk } from './types';
import { LLM_CONFIG } from '@/config/llmConfig';
import { parseOpenAIStream } from '@/lib/streaming/sse-parser';
import { getDefaultModelId } from '@/lib/models/registry';

const TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 1;
const TRANSIENT_STATUS_CODES = [429, 500, 502, 503, 504];

export class PerplexityAdapter implements LLMAdapter {
  name = 'perplexity';

  constructor(private userApiKey?: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.perplexity.apiKey;
    if (!apiKey) throw new Error('Perplexity API key not configured');

    const messages: any[] = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push(...params.messages);

    const requestBody = {
      model: params.model || getDefaultModelId('perplexity'),
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens || 2000,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();

          if (!TRANSIENT_STATUS_CODES.includes(response.status)) {
            throw new Error(`Perplexity API error: ${response.status} ${errorText}`);
          }

          if (response.status === 429 && attempt < MAX_RETRIES) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue;
          }

          throw new Error(`Perplexity API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        return {
          content: data.choices[0]?.message?.content || 'No response',
          provider: 'perplexity',
          model: data.model || requestBody.model,
          usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          } : undefined,
        };
      } catch (error: any) {
        lastError = error;
        if (error.name === 'AbortError') {
          lastError = new Error('Perplexity request timed out');
        }
        if (attempt < MAX_RETRIES && error.name !== 'AbortError' &&
            (error.message?.includes('429') || error.message?.includes('500') ||
             error.message?.includes('502') || error.message?.includes('503') ||
             error.message?.includes('504') || error.message?.includes('fetch failed'))) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('Perplexity request failed');
  }

  async *chatStream(params: LLMChatParams): AsyncGenerator<StreamChunk> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.perplexity.apiKey;
    if (!apiKey) throw new Error('Perplexity API key not configured');

    const messages: any[] = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push(...params.messages);

    const requestBody = {
      model: params.model || getDefaultModelId('perplexity'),
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens || 2000,
      stream: true,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity streaming error: ${response.status} ${errorText}`);
      }

      for await (const chunk of parseOpenAIStream(response)) {
        if (chunk.content) {
          yield {
            content: chunk.content,
            done: false,
            provider: 'perplexity',
            model: chunk.model || requestBody.model,
          };
        }

        if (chunk.finishReason === 'stop') {
          yield {
            content: '',
            done: true,
            provider: 'perplexity',
            model: chunk.model || requestBody.model,
            usage: chunk.usage ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            } : undefined,
          };
          return;
        }
      }

      yield { content: '', done: true, provider: 'perplexity', model: requestBody.model };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Perplexity streaming request timed out');
      }
      throw error;
    }
  }
}
