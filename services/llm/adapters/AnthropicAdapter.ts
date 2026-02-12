/**
 * Anthropic Adapter
 *
 * Adapter for Anthropic Claude API.
 * Supports streaming, retries, rate limit handling, and timeouts.
 */

import { LLM_CONFIG } from '@/config/llmConfig';
import type { LLMAdapter, LLMChatParams, LLMChatResponse, StreamChunk } from './types';
import { parseAnthropicStream } from '@/lib/streaming/sse-parser';
import { getDefaultModelId, getModelMaxOutput } from '@/lib/models/registry';

const TIMEOUT_MS = 60000; // 60s — Claude responses can be long
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 1;
const TRANSIENT_STATUS_CODES = [429, 500, 502, 503, 504];

export class AnthropicAdapter implements LLMAdapter {
  name = 'anthropic';

  constructor(private apiKey?: string) {
    this.apiKey = apiKey || LLM_CONFIG.premium.anthropic.apiKey;
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    if (!this.apiKey) throw new Error('Anthropic API key not configured');

    const { messages, model, temperature, maxTokens, systemPrompt } = params;

    // Filter out system messages (Claude uses separate system parameter)
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    // Combine system prompts
    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
    if (systemPrompt) systemMessages.unshift(systemPrompt);
    const combinedSystem = systemMessages.join('\n\n');

    const requestBody: any = {
      model: model || getDefaultModelId('anthropic'),
      max_tokens: maxTokens || getModelMaxOutput('anthropic', model),
      messages: anthropicMessages,
    };

    if (combinedSystem) requestBody.system = combinedSystem;
    if (temperature !== undefined) requestBody.temperature = temperature;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error');

          if (!TRANSIENT_STATUS_CODES.includes(response.status)) {
            throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, retryAfter * 1000));
              continue;
            }
          }

          throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        return {
          content: data.content?.[0]?.text || 'No response',
          provider: 'anthropic',
          model: data.model,
          usage: data.usage ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          } : undefined,
        };
      } catch (error: any) {
        lastError = error;
        if (error.name === 'AbortError') {
          lastError = new Error(`Anthropic request timed out after ${TIMEOUT_MS}ms`);
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

    throw lastError || new Error('Anthropic request failed');
  }

  async *chatStream(params: LLMChatParams): AsyncGenerator<StreamChunk> {
    if (!this.apiKey) throw new Error('Anthropic API key not configured');

    const { messages, model, temperature, maxTokens, systemPrompt } = params;

    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
    if (systemPrompt) systemMessages.unshift(systemPrompt);
    const combinedSystem = systemMessages.join('\n\n');

    const requestBody: any = {
      model: model || getDefaultModelId('anthropic'),
      max_tokens: maxTokens || getModelMaxOutput('anthropic', model),
      messages: anthropicMessages,
      stream: true,
    };

    if (combinedSystem) requestBody.system = combinedSystem;
    if (temperature !== undefined) requestBody.temperature = temperature;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2min for streaming

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
        throw new Error(`Anthropic streaming error: ${response.status} ${errorText}`);
      }

      let streamModel: string | undefined;
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of parseAnthropicStream(response)) {
        if (chunk.model) streamModel = chunk.model;
        if (chunk.usage?.input_tokens) inputTokens = chunk.usage.input_tokens;
        if (chunk.usage?.output_tokens) outputTokens = chunk.usage.output_tokens;

        if (chunk.content) {
          yield {
            content: chunk.content,
            done: false,
            provider: 'anthropic',
            model: streamModel || requestBody.model,
          };
        }

        if (chunk.done) {
          yield {
            content: '',
            done: true,
            provider: 'anthropic',
            model: streamModel || requestBody.model,
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          };
          return;
        }
      }

      yield {
        content: '',
        done: true,
        provider: 'anthropic',
        model: streamModel || requestBody.model,
        usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens },
      };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Anthropic streaming request timed out');
      }
      throw error;
    }
  }
}
