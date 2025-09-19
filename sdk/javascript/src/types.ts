/**
 * Type definitions for CacheGPT SDK
 */

export interface CacheGPTConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  messages?: ChatMessage[];
}

export interface ChatResponse {
  content: string;
  model: string;
  cached: boolean;
  tokensUsed: number;
  cost: number;
  responseTime: number;
  cacheHit?: boolean;
  similarity?: number;
}

export interface CacheStats {
  entries: number;
  hitRate: number;
  totalSaved: number;
  totalRequests: number;
  cacheHits: number;
}

export interface Usage {
  userId: string;
  totalRequests: number;
  cacheHits: number;
  totalTokens: number;
  totalCost: number;
  totalSaved: number;
  period: 'day' | 'week' | 'month';
}