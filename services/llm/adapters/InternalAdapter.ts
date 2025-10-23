/**
 * Internal LLM Adapter
 *
 * Adapter for internal/native LLM provider (first priority).
 * This should be used for all free/internal requests by default.
 */

import { LLM_CONFIG } from '@/config/llmConfig';
import type { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';

export class InternalAdapter implements LLMAdapter {
  name = 'internal';

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const { messages, model, temperature, maxTokens, systemPrompt } = params;

    // Prepare messages (add system prompt if provided)
    const messagesWithSystem = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    // Prepare request body (adapt to internal LLM format)
    const requestBody = {
      messages: messagesWithSystem.map(m => ({
        role: m.role,
        content: m.content,
      })),
      model: model || LLM_CONFIG.internal.model,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 2000,
    };

    // Add API key header if configured
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (LLM_CONFIG.internal.apiKey) {
      headers['Authorization'] = `Bearer ${LLM_CONFIG.internal.apiKey}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LLM_CONFIG.internal.timeoutMs);

      const response = await fetch(`${LLM_CONFIG.internal.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
        throw new Error(`Internal LLM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Extract response (adapt from internal LLM format)
      const content = data.choices?.[0]?.message?.content || data.response || 'No response';

      return {
        content,
        provider: 'internal',
        model: data.model || model || LLM_CONFIG.internal.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Internal LLM request timeout after ${LLM_CONFIG.internal.timeoutMs}ms`);
      }
      throw error;
    }
  }
}
