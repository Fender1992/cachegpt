/**
 * Anthropic Adapter
 *
 * Adapter for Anthropic Claude API.
 * ONLY used when explicitly requested via:
 * 1. x-llm-provider: anthropic header
 * 2. User has stored Anthropic API key
 * 3. Fallback is explicitly allowed (LLM_ALLOW_FALLBACK_TO_PREMIUM=true)
 *
 * IMPORTANT: Presence of ANTHROPIC_API_KEY does NOT trigger automatic usage.
 */

import { LLM_CONFIG } from '@/config/llmConfig';
import type { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';

export class AnthropicAdapter implements LLMAdapter {
  name = 'anthropic';

  constructor(private apiKey?: string) {
    // Use provided key (user's) or server key
    this.apiKey = apiKey || LLM_CONFIG.premium.anthropic.apiKey;
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

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
    if (systemPrompt) {
      systemMessages.unshift(systemPrompt);
    }
    const combinedSystem = systemMessages.join('\n\n');

    const requestBody: any = {
      model: model || 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens || 4096,
      messages: anthropicMessages,
    };

    if (combinedSystem) {
      requestBody.system = combinedSystem;
    }

    if (temperature !== undefined) {
      requestBody.temperature = temperature;
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
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
      console.error('[ANTHROPIC-ADAPTER] Error:', error.message);
      throw error;
    }
  }
}
