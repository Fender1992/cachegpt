/**
 * Perplexity Adapter
 *
 * Adapter for Perplexity AI models (with online search capabilities)
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';
import { LLM_CONFIG } from '@/config/llmConfig';

export class PerplexityAdapter implements LLMAdapter {
  name = 'perplexity';

  constructor(private userApiKey?: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.perplexity.apiKey;

    if (!apiKey) {
      throw new Error('Perplexity API key not configured');
    }

    // Build messages array
    const messages: any[] = [];

    // Add system prompt if provided
    if (params.systemPrompt) {
      messages.push({
        role: 'system',
        content: params.systemPrompt,
      });
    }

    // Add conversation messages
    messages.push(...params.messages);

    const requestBody = {
      model: params.model || 'llama-3.1-sonar-huge-128k-online', // Default to Sonar with online search
      messages,
      temperature: params.temperature || 0.7,
      max_tokens: params.maxTokens || 2000,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Perplexity request timed out');
      }
      throw error;
    }
  }
}
