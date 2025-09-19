/**
 * CacheGPT JavaScript/TypeScript Client
 */

import {
  AuthenticationError,
  RateLimitError,
  APIError,
  NetworkError
} from './exceptions';

import type {
  ChatMessage,
  ChatResponse,
  CacheStats,
  Usage,
  CacheGPTConfig,
  ChatOptions
} from './types';

export class CacheGPT {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private headers: Record<string, string>;

  /**
   * Initialize CacheGPT client
   *
   * @example
   * ```typescript
   * import { CacheGPT } from 'cachegpt';
   *
   * const client = new CacheGPT({ apiKey: 'cgpt_...' });
   * const response = await client.chat('Hello!');
   * console.log(response.content);
   * ```
   */
  constructor(config: CacheGPTConfig) {
    this.apiKey = config.apiKey || process.env.CACHEGPT_API_KEY || '';

    if (!this.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    this.baseUrl = (config.baseUrl || process.env.CACHEGPT_BASE_URL || 'https://api.cachegpt.io').replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;

    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `cachegpt-js/1.0.0`
    };
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.keys(params).forEach(key =>
        url.searchParams.append(key, params[key])
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url.toString(), {
          method,
          headers: this.headers,
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
          throw new RateLimitError(`Rate limit exceeded. Retry after ${retryAfter} seconds`, retryAfter);
        }

        // Handle authentication errors
        if (response.status === 401) {
          throw new AuthenticationError('Invalid API key');
        }

        // Handle other errors
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          throw new APIError(
            `API error (${response.status}): ${error.error || error.message}`,
            response.status,
            error
          );
        }

        return await response.json();

      } catch (error: any) {
        lastError = error;

        // Don't retry on auth errors
        if (error instanceof AuthenticationError) {
          throw error;
        }

        // Don't retry on rate limit errors
        if (error instanceof RateLimitError) {
          throw error;
        }

        // Network errors - retry
        if (error.name === 'AbortError') {
          lastError = new NetworkError('Request timeout');
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
          lastError = new NetworkError('Network request failed');
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new NetworkError('Request failed after retries');
  }

  /**
   * Send a chat completion request
   */
  async chat(
    message: string | ChatMessage[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const messages = typeof message === 'string'
      ? [{ role: 'user', content: message }]
      : message;

    const data = {
      messages,
      model: options.model || 'gpt-3.5-turbo',
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens,
      stream: options.stream || false
    };

    return await this.makeRequest<ChatResponse>('POST', '/v1/chat', data);
  }

  /**
   * Simplified chat method that returns just the content
   */
  async ask(question: string, options?: ChatOptions): Promise<string> {
    const response = await this.chat(question, options);
    return response.content;
  }

  /**
   * Get cache statistics
   */
  async getStats(days: number = 7): Promise<CacheStats> {
    return await this.makeRequest<CacheStats>('GET', '/v1/stats', undefined, { days });
  }

  /**
   * Get current usage and quota
   */
  async getUsage(): Promise<Usage> {
    return await this.makeRequest<Usage>('GET', '/v1/usage');
  }

  /**
   * Clear cache entries
   */
  async clearCache(olderThanHours?: number): Promise<{ deleted: number }> {
    const data = olderThanHours ? { older_than_hours: olderThanHours } : {};
    return await this.makeRequest('POST', '/v1/cache/clear', data);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return await this.makeRequest('GET', '/v1/health');
  }

  /**
   * Stream chat responses (for real-time streaming)
   */
  async *streamChat(
    message: string | ChatMessage[],
    options: ChatOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const messages = typeof message === 'string'
      ? [{ role: 'user', content: message }]
      : message;

    const response = await fetch(`${this.baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        messages,
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      throw new APIError(`Stream error: ${response.statusText}`, response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new APIError('No response body', 500);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const json = JSON.parse(data);
            if (json.content) {
              yield json.content;
            }
          } catch (e) {
            // Invalid JSON, skip
          }
        }
      }
    }
  }
}