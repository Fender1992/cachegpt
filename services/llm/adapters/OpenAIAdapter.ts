/**
 * OpenAI Adapter
 *
 * Adapter for OpenAI GPT models (GPT-4o, GPT-5, etc.)
 * Supports streaming, retries, rate limit handling, and timeouts.
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse, StreamChunk } from './types';
import { LLM_CONFIG } from '@/config/llmConfig';
import { parseOpenAIStream } from '@/lib/streaming/sse-parser';

const TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 1;
const TRANSIENT_STATUS_CODES = [429, 500, 502, 503, 504];

export class OpenAIAdapter implements LLMAdapter {
  name = 'openai';

  constructor(private userApiKey?: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.openai.apiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const { messages, model, temperature, maxTokens, systemPrompt } = params;

    const allMessages: any[] = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const requestBody = {
      model: model || 'gpt-4o',
      messages: allMessages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2000,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

          // Don't retry on permanent failures
          if (!TRANSIENT_STATUS_CODES.includes(response.status)) {
            throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
          }

          // Handle rate limit with Retry-After
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, retryAfter * 1000));
              continue;
            }
          }

          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        return {
          content: data.choices[0]?.message?.content || 'No response',
          provider: 'openai',
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
          lastError = new Error('OpenAI request timed out');
        }
        // Retry on transient errors
        if (attempt < MAX_RETRIES && error.name !== 'AbortError' &&
            (error.message?.includes('429') || error.message?.includes('500') ||
             error.message?.includes('502') || error.message?.includes('503') ||
             error.message?.includes('504') || error.message?.includes('ECONNREFUSED') ||
             error.message?.includes('fetch failed'))) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('OpenAI request failed');
  }

  async *chatStream(params: LLMChatParams): AsyncGenerator<StreamChunk> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.openai.apiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const { messages, model, temperature, maxTokens, systemPrompt } = params;

    const allMessages: any[] = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const requestBody = {
      model: model || 'gpt-4o',
      messages: allMessages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2000,
      stream: true,
      stream_options: { include_usage: true },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // Longer timeout for streaming

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        throw new Error(`OpenAI streaming error: ${response.status} ${errorText}`);
      }

      let finalUsage: StreamChunk['usage'] | undefined;

      for await (const chunk of parseOpenAIStream(response)) {
        if (chunk.usage) {
          finalUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        if (chunk.content) {
          yield {
            content: chunk.content,
            done: false,
            provider: 'openai',
            model: chunk.model || requestBody.model,
          };
        }

        if (chunk.finishReason === 'stop') {
          yield {
            content: '',
            done: true,
            provider: 'openai',
            model: chunk.model || requestBody.model,
            usage: finalUsage,
          };
          return;
        }
      }

      // If we exhaust the stream without a stop signal
      yield { content: '', done: true, provider: 'openai', model: requestBody.model, usage: finalUsage };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('OpenAI streaming request timed out');
      }
      throw error;
    }
  }
}
