/**
 * LLM Adapter Types
 *
 * Common interface for all LLM providers to ensure consistent behavior.
 */

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMChatParams {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
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
}

export interface LLMAdapter {
  name: string;
  chat(params: LLMChatParams): Promise<LLMChatResponse>;
}
