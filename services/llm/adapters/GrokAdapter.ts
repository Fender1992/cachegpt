/**
 * Grok LLM Adapter
 *
 * Adapter for xAI's Grok models via OpenRouter
 * Provides access to Grok-2 with built-in web search and reasoning capabilities
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';

export class GrokAdapter implements LLMAdapter {
  name = 'grok';
  private apiKey: string;
  private endpoint: string = 'https://openrouter.ai/api/v1/chat/completions';
  private model: string = 'x-ai/grok-2-1212'; // Grok 2 - Latest stable

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('[GROK-ADAPTER] No API key provided. Set OPENROUTER_API_KEY environment variable.');
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    try {
      const {
        messages,
        model,
        temperature = 0.7,
        maxTokens = 2000,
        systemPrompt,
        qualityMode = 'fast'
      } = params;

      // Prepare messages with system prompt if provided
      const formattedMessages = [...messages];
      if (systemPrompt && formattedMessages[0]?.role !== 'system') {
        formattedMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      console.log(`[GROK-ADAPTER] Calling Grok model: ${model || this.model}, quality: ${qualityMode}`);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://cachegpt.app',
          'X-Title': 'CacheGPT'
        },
        body: JSON.stringify({
          model: model || this.model,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens,
          // OpenRouter-specific settings
          provider: {
            allow_fallbacks: false,
            data_collection: 'deny',
            quantization: qualityMode === 'best' ? 'none' : 'auto'
          },
          // Grok-specific features (if supported)
          tools: [], // Can be extended for function calling
          tool_choice: 'auto'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROK-ADAPTER] API error: ${response.status}`);
        throw new Error(`Grok API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('[GROK-ADAPTER] No response choices returned');
      }

      const content = data.choices[0].message?.content;

      if (!content) {
        throw new Error('[GROK-ADAPTER] No content in response');
      }

      console.log(`[GROK-ADAPTER] ✅ Success (${content.length} chars, ${data.usage?.total_tokens || 0} tokens)`);

      return {
        content,
        provider: 'grok',
        model: data.model || model || this.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens
        },
        qualityMode
      };

    } catch (error: any) {
      console.error('[GROK-ADAPTER] Error:', error.message);
      throw new Error(`Grok adapter failed: ${error.message}`);
    }
  }

  /**
   * Get available Grok models
   */
  static getAvailableModels(): string[] {
    return [
      'x-ai/grok-2-1212',        // Grok 2 - Latest stable (Dec 2024)
      'x-ai/grok-2-vision-1212', // Grok 2 with vision capabilities
      'x-ai/grok-beta',          // Beta version with latest features
      'x-ai/grok-vision-beta'    // Beta vision model
    ];
  }

  /**
   * Get recommended model for task type
   */
  static getRecommendedModel(taskType: 'general' | 'vision' | 'factual' | 'creative'): string {
    const recommendations = {
      general: 'x-ai/grok-2-1212',
      vision: 'x-ai/grok-2-vision-1212',
      factual: 'x-ai/grok-2-1212',    // Grok excels at factual queries
      creative: 'x-ai/grok-beta'       // Beta has more creative capabilities
    };

    return recommendations[taskType] || 'x-ai/grok-2-1212';
  }
}
