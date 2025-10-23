/**
 * Google Gemini Adapter
 *
 * Adapter for Google Gemini models
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse } from './types';
import { LLM_CONFIG } from '@/config/llmConfig';

export class GoogleAdapter implements LLMAdapter {
  name = 'google';

  constructor(private userApiKey?: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.google.apiKey;

    if (!apiKey) {
      throw new Error('Google API key not configured');
    }

    const model = params.model || 'gemini-2.0-flash-exp'; // Default to Gemini 2.0 Flash

    // Build contents array (Gemini format)
    const contents: any[] = [];

    // Add system prompt as first user message with marker
    if (params.systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `[System Instructions]: ${params.systemPrompt}` }],
      });
    }

    // Add conversation messages
    for (const msg of params.messages) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : 'user',
        parts: [{ text: msg.role === 'system' ? `[System Instructions]: ${msg.content}` : msg.content }],
      });
    }

    const requestBody = {
      contents,
      generationConfig: {
        temperature: params.temperature || 0.7,
        maxOutputTokens: params.maxTokens || 2000,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
        provider: 'google',
        model: model,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        } : undefined,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Google API request timed out');
      }
      throw error;
    }
  }
}
