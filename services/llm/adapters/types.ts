/**
 * LLM Adapter Types
 *
 * Common interface for all LLM providers to ensure consistent behavior.
 */

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type ChatQualityMode = 'fast' | 'best';

export interface LLMChatParams {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  qualityMode?: ChatQualityMode; // 'fast' = first-success, 'best' = Self-MoA aggregation
}

export interface LLMChatResponse {
  content: string;
  provider: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  qualityMode?: ChatQualityMode;
  aggregatedFrom?: string[]; // List of providers used in aggregation (for 'best' mode)
}

/**
 * Streaming chunk emitted by chatStream()
 */
export interface StreamChunk {
  content: string;       // Incremental delta text
  done: boolean;
  provider: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMAdapter {
  name: string;
  chat(params: LLMChatParams): Promise<LLMChatResponse>;
  chatStream?(params: LLMChatParams): AsyncGenerator<StreamChunk>;
}
