/**
 * Cache System Test Fixtures
 * Provides mock data for testing cache operations
 */

import { vi } from 'vitest'

export interface MockCachedResponse {
  id: string
  query: string
  query_hash: string
  response: string
  model: string
  provider: string
  tier: 'hot' | 'warm' | 'cool' | 'cold' | 'frozen'
  access_count: number
  popularity_score: number
  similarity: number
  lifecycle: string
  quality_score: number
  user_id?: string
  created_at: string
  updated_at: string
  expires_at: string
  last_accessed: string
  tokens_used: number
  cost_saved: number
}

export interface MockCacheMetadata {
  id: string
  cache_id: string
  query_type: 'TIME_SENSITIVE' | 'FACTUAL' | 'CREATIVE' | 'DYNAMIC' | 'GENERAL'
  context_hash: string
  version: string
  feedback_helpful: number
  feedback_outdated: number
  feedback_incorrect: number
}

/**
 * Creates a mock cached response with default values
 */
export function createMockCachedResponse(
  overrides: Partial<MockCachedResponse> = {}
): MockCachedResponse {
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

  return {
    id: `cache-${Math.random().toString(36).substring(7)}`,
    query: 'What is artificial intelligence?',
    query_hash: 'abc123def456',
    response:
      'Artificial intelligence (AI) is the simulation of human intelligence processes by machines, especially computer systems.',
    model: 'free-model:v4-weather',
    provider: 'groq',
    tier: 'warm',
    access_count: 5,
    popularity_score: 75.5,
    similarity: 0.92,
    lifecycle: 'active',
    quality_score: 85,
    created_at: now,
    updated_at: now,
    expires_at: expires,
    last_accessed: now,
    tokens_used: 150,
    cost_saved: 0.003,
    ...overrides,
  }
}

/**
 * Creates a hot tier cached response (frequently accessed)
 */
export function createHotCacheEntry(): MockCachedResponse {
  return createMockCachedResponse({
    tier: 'hot',
    access_count: 100,
    popularity_score: 95.0,
    similarity: 0.98,
  })
}

/**
 * Creates a cold tier cached response (rarely accessed)
 */
export function createColdCacheEntry(): MockCachedResponse {
  const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago
  return createMockCachedResponse({
    tier: 'cold',
    access_count: 1,
    popularity_score: 10.0,
    created_at: oldDate,
    last_accessed: oldDate,
  })
}

/**
 * Creates a stale cached response (marked for expiration)
 */
export function createStaleCacheEntry(): MockCachedResponse {
  return createMockCachedResponse({
    tier: 'frozen',
    lifecycle: 'stale',
    access_count: 2,
    quality_score: 30,
  })
}

/**
 * Creates mock cache metadata
 */
export function createMockCacheMetadata(
  overrides: Partial<MockCacheMetadata> = {}
): MockCacheMetadata {
  return {
    id: `meta-${Math.random().toString(36).substring(7)}`,
    cache_id: `cache-${Math.random().toString(36).substring(7)}`,
    query_type: 'GENERAL',
    context_hash: 'ctx123abc',
    version: 'v4-weather',
    feedback_helpful: 5,
    feedback_outdated: 0,
    feedback_incorrect: 0,
    ...overrides,
  }
}

/**
 * Creates a time-sensitive query cache entry
 */
export function createTimeSensitiveCacheEntry(): MockCachedResponse {
  return createMockCachedResponse({
    query: 'What is the weather in New York today?',
    tier: 'hot',
    lifecycle: 'time_sensitive',
  })
}

/**
 * Creates a batch of cache entries for testing pagination/filtering
 */
export function createCacheBatch(count: number = 10): MockCachedResponse[] {
  return Array.from({ length: count }, (_, i) =>
    createMockCachedResponse({
      id: `cache-${i}`,
      access_count: count - i, // Descending access count
      popularity_score: 100 - i * 10,
    })
  )
}

/**
 * Creates mock embedding vector (384 dimensions for default model)
 */
export function createMockEmbedding(dimensions: number = 384): number[] {
  // Create a normalized vector
  const vector = Array.from({ length: dimensions }, () => Math.random() - 0.5)
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  return vector.map((val) => val / magnitude)
}

/**
 * Creates a mock cache service for testing
 */
export function createMockCacheService() {
  return {
    findSimilarResponse: vi.fn(),
    storeResponse: vi.fn(),
    updateAccessStats: vi.fn(),
    recordFeedback: vi.fn(),
    getLifecycleStats: vi.fn(),
    promoteToHot: vi.fn(),
    demoteToFrozen: vi.fn(),
  }
}

/**
 * Query type test cases
 */
export const queryTypeTestCases = [
  { query: 'What is the weather today?', expectedType: 'TIME_SENSITIVE' },
  { query: 'What is the current stock price of AAPL?', expectedType: 'TIME_SENSITIVE' },
  { query: 'Latest news about technology', expectedType: 'TIME_SENSITIVE' },
  { query: 'What is the capital of France?', expectedType: 'FACTUAL' },
  { query: 'What year was the Declaration of Independence signed?', expectedType: 'FACTUAL' },
  { query: 'Write me a poem about love', expectedType: 'CREATIVE' },
  { query: 'Create a story about a dragon', expectedType: 'CREATIVE' },
  { query: 'How do I fix this bug in my React code?', expectedType: 'DYNAMIC' },
  { query: 'Explain async/await in JavaScript', expectedType: 'DYNAMIC' },
  { query: 'Hello, how are you?', expectedType: 'GENERAL' },
]
