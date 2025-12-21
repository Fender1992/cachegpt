/**
 * LLM Provider Mock Utilities for Unit Tests
 * Provides mock implementations for LLM adapters and provider resolution
 */

import { vi } from 'vitest'

export interface MockLLMResponse {
  content: string
  model: string
  provider: string
  tokens: {
    input: number
    output: number
    total: number
  }
  cached: boolean
  responseTimeMs: number
}

export interface MockProviderConfig {
  name: string
  isHealthy: boolean
  isEnabled: boolean
  models: string[]
  priority: number
}

/**
 * Creates a mock LLM response
 */
export function createMockLLMResponse(
  overrides: Partial<MockLLMResponse> = {}
): MockLLMResponse {
  return {
    content: 'This is a mock response from the AI model.',
    model: 'gpt-4',
    provider: 'openai',
    tokens: {
      input: 50,
      output: 100,
      total: 150,
    },
    cached: false,
    responseTimeMs: 500,
    ...overrides,
  }
}

/**
 * Creates a mock streaming response
 */
export function createMockStreamingResponse(chunks: string[]): ReadableStream<string> {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index])
        index++
      } else {
        controller.close()
      }
    },
  })
}

/**
 * Creates mock provider configuration
 */
export function createMockProviderConfig(
  overrides: Partial<MockProviderConfig> = {}
): MockProviderConfig {
  return {
    name: 'openai',
    isHealthy: true,
    isEnabled: true,
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    priority: 1,
    ...overrides,
  }
}

/**
 * Creates a set of mock providers for testing resolution
 */
export function createMockProviderSet(): MockProviderConfig[] {
  return [
    createMockProviderConfig({
      name: 'internal',
      priority: 0,
      models: ['internal-llm'],
    }),
    createMockProviderConfig({
      name: 'groq',
      priority: 1,
      models: ['llama-3.1-70b', 'mixtral-8x7b'],
    }),
    createMockProviderConfig({
      name: 'openai',
      priority: 2,
      models: ['gpt-4', 'gpt-4-turbo'],
    }),
    createMockProviderConfig({
      name: 'anthropic',
      priority: 3,
      models: ['claude-3-opus', 'claude-3-sonnet'],
    }),
  ]
}

/**
 * Mock LLM adapter factory
 */
export function createMockAdapter(provider: string) {
  return {
    provider,
    isHealthy: vi.fn().mockResolvedValue(true),
    chat: vi.fn().mockResolvedValue(createMockLLMResponse({ provider })),
    streamChat: vi.fn().mockResolvedValue(
      createMockStreamingResponse(['Hello', ' world', '!'])
    ),
    getModels: vi.fn().mockReturnValue(['model-1', 'model-2']),
    validateApiKey: vi.fn().mockResolvedValue(true),
  }
}

/**
 * Mock provider resolver
 */
export function createMockProviderResolver() {
  return {
    resolveProvider: vi.fn().mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4',
      adapter: createMockAdapter('openai'),
    }),
    getAvailableProviders: vi.fn().mockReturnValue(['openai', 'anthropic', 'groq']),
    isProviderHealthy: vi.fn().mockResolvedValue(true),
    getProviderPriority: vi.fn().mockReturnValue(1),
  }
}

/**
 * Mock health check service
 */
export function createMockHealthChecker() {
  return {
    checkHealth: vi.fn().mockResolvedValue({
      healthy: true,
      latency: 50,
      lastChecked: new Date().toISOString(),
    }),
    forceCheck: vi.fn().mockResolvedValue({
      healthy: true,
      latency: 50,
      lastChecked: new Date().toISOString(),
    }),
    getCachedHealth: vi.fn().mockReturnValue({
      healthy: true,
      latency: 50,
      lastChecked: new Date().toISOString(),
    }),
  }
}

/**
 * Provider-specific mock responses
 */
export const providerMockResponses = {
  openai: createMockLLMResponse({
    provider: 'openai',
    model: 'gpt-4',
    content: 'Response from OpenAI GPT-4',
  }),
  anthropic: createMockLLMResponse({
    provider: 'anthropic',
    model: 'claude-3-opus',
    content: 'Response from Anthropic Claude 3 Opus',
  }),
  groq: createMockLLMResponse({
    provider: 'groq',
    model: 'llama-3.1-70b',
    content: 'Response from Groq Llama 3.1',
    responseTimeMs: 100, // Groq is fast
  }),
  google: createMockLLMResponse({
    provider: 'google',
    model: 'gemini-2.0-ultra',
    content: 'Response from Google Gemini 2.0 Ultra',
  }),
}

/**
 * Model configuration test data
 */
export const modelConfigs = {
  'gpt-4': { maxTokens: 8192, costPer1kInput: 0.03, costPer1kOutput: 0.06 },
  'gpt-4-turbo': { maxTokens: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
  'claude-3-opus': { maxTokens: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
  'claude-3-sonnet': { maxTokens: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
  'llama-3.1-70b': { maxTokens: 8192, costPer1kInput: 0.0, costPer1kOutput: 0.0 },
}
