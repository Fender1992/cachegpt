/**
 * Google Gemini Adapter
 *
 * Adapter for Google Gemini models.
 * Supports streaming, proper systemInstruction field, and timeouts.
 */

import { LLMAdapter, LLMChatParams, LLMChatResponse, StreamChunk } from './types';
import { LLM_CONFIG } from '@/config/llmConfig';
import { parseGeminiStream } from '@/lib/streaming/sse-parser';

const TIMEOUT_MS = 30000;

export class GoogleAdapter implements LLMAdapter {
  name = 'google';

  constructor(private userApiKey?: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.google.apiKey;
    if (!apiKey) throw new Error('Google API key not configured');

    const model = params.model || 'gemini-2.0-flash-exp';

    // Build contents array (Gemini format) — exclude system messages
    const contents: any[] = [];
    for (const msg of params.messages) {
      if (msg.role === 'system') continue; // Handled via systemInstruction
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Collect all system prompts
    const systemParts: string[] = [];
    if (params.systemPrompt) systemParts.push(params.systemPrompt);
    for (const msg of params.messages) {
      if (msg.role === 'system') systemParts.push(msg.content);
    }

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: params.temperature || 0.7,
        maxOutputTokens: params.maxTokens || 2000,
      },
    };

    // Use proper systemInstruction field instead of prepending as user message
    if (systemParts.length > 0) {
      requestBody.systemInstruction = {
        parts: [{ text: systemParts.join('\n\n') }],
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        model,
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

  async *chatStream(params: LLMChatParams): AsyncGenerator<StreamChunk> {
    const apiKey = this.userApiKey || LLM_CONFIG.premium.google.apiKey;
    if (!apiKey) throw new Error('Google API key not configured');

    const model = params.model || 'gemini-2.0-flash-exp';

    const contents: any[] = [];
    for (const msg of params.messages) {
      if (msg.role === 'system') continue;
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    const systemParts: string[] = [];
    if (params.systemPrompt) systemParts.push(params.systemPrompt);
    for (const msg of params.messages) {
      if (msg.role === 'system') systemParts.push(msg.content);
    }

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: params.temperature || 0.7,
        maxOutputTokens: params.maxTokens || 2000,
      },
    };

    if (systemParts.length > 0) {
      requestBody.systemInstruction = {
        parts: [{ text: systemParts.join('\n\n') }],
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      // Use streamGenerateContent endpoint
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google streaming error: ${response.status} ${errorText}`);
      }

      for await (const chunk of parseGeminiStream(response)) {
        if (chunk.content) {
          yield {
            content: chunk.content,
            done: false,
            provider: 'google',
            model,
          };
        }

        if (chunk.done) {
          yield {
            content: '',
            done: true,
            provider: 'google',
            model,
            usage: chunk.usage ? {
              promptTokens: chunk.usage.promptTokenCount,
              completionTokens: chunk.usage.candidatesTokenCount,
              totalTokens: chunk.usage.totalTokenCount,
            } : undefined,
          };
          return;
        }
      }

      yield { content: '', done: true, provider: 'google', model };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Google streaming request timed out');
      }
      throw error;
    }
  }
}
