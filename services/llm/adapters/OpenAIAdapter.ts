/**
 * OpenAI Adapter
 *
 * Adapter for OpenAI GPT models (GPT-4, GPT-5, etc.)
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';
import { LLM_CONFIG } from '@/config/llmConfig';

export class OpenAIAdapter implements LLMAdapter {
  name = 'openai';

  constructor(private userApiKey?: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.openai.apiKey;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
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
      model: params.model || 'gpt-4o', // Default to GPT-4o
      messages,
      temperature: params.temperature || 0.7,
      max_tokens: params.maxTokens || 2000,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('OpenAI request timed out');
      }
      throw error;
    }
  }
}
