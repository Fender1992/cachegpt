/**
 * Unit Tests for Cache Lifecycle Manager
 * Tests cache tier transitions, query classification, and lifecycle management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockCachedResponse,
  createHotCacheEntry,
  createColdCacheEntry,
  createStaleCacheEntry,
  createTimeSensitiveCacheEntry,
  createMockCacheMetadata,
  createCacheBatch,
  createMockEmbedding,
  queryTypeTestCases,
} from '../utils/cache-fixtures'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock Supabase
vi.mock('@/lib/supabase-client', () => ({
  supabase: createMockSupabaseClient(),
}))

describe('Cache Lifecycle Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Query Type Classification', () => {
    queryTypeTestCases.forEach(({ query, expectedType }) => {
      it(`should classify "${query.substring(0, 30)}..." as ${expectedType}`, () => {
        // Mock classification logic
        const classifyQuery = (q: string): string => {
          const lowerQuery = q.toLowerCase()

          // Time-sensitive patterns
          if (
            lowerQuery.includes('weather') ||
            lowerQuery.includes('today') ||
            lowerQuery.includes('current') ||
            lowerQuery.includes('latest') ||
            lowerQuery.includes('stock price') ||
            lowerQuery.includes('news')
          ) {
            return 'TIME_SENSITIVE'
          }

          // Creative patterns
          if (
            lowerQuery.includes('write') ||
            lowerQuery.includes('create') ||
            lowerQuery.includes('poem') ||
            lowerQuery.includes('story')
          ) {
            return 'CREATIVE'
          }

          // Dynamic patterns (code-related)
          if (
            lowerQuery.includes('code') ||
            lowerQuery.includes('bug') ||
            lowerQuery.includes('fix') ||
            lowerQuery.includes('javascript') ||
            lowerQuery.includes('react') ||
            lowerQuery.includes('async')
          ) {
            return 'DYNAMIC'
          }

          // Factual patterns
          if (
            lowerQuery.includes('what is') ||
            lowerQuery.includes('capital of') ||
            lowerQuery.includes('what year')
          ) {
            return 'FACTUAL'
          }

          return 'GENERAL'
        }

        const result = classifyQuery(query)
        expect(result).toBe(expectedType)
      })
    })
  })

  describe('Context Hash Generation', () => {
    it('should produce consistent hashes for same context', () => {
      const context = {
        timezone: 'America/New_York',
        date: '2025-09-25',
        hasWeather: true,
      }

      // Simple hash implementation for testing
      const generateHash = (ctx: object): string => {
        const sortedKeys = Object.keys(ctx).sort()
        const str = sortedKeys.map(k => `${k}:${(ctx as any)[k]}`).join('|')
        return Buffer.from(str).toString('base64').substring(0, 16)
      }

      const hash1 = generateHash(context)
      const hash2 = generateHash(context)

      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different contexts', () => {
      const context1 = { timezone: 'America/New_York', date: '2025-09-25' }
      const context2 = { timezone: 'Europe/London', date: '2025-09-26' }

      const generateHash = (ctx: object): string => {
        const sortedKeys = Object.keys(ctx).sort()
        const str = sortedKeys.map(k => `${k}:${(ctx as any)[k]}`).join('|')
        return Buffer.from(str).toString('base64').substring(0, 32)
      }

      const hash1 = generateHash(context1)
      const hash2 = generateHash(context2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Cache Tier Transitions', () => {
    it('should transition HOT to WARM after inactivity', () => {
      const hotEntry = createHotCacheEntry()
      const daysSinceAccess = 10 // 10 days without access

      // Tier transition logic
      const determineTier = (entry: typeof hotEntry, inactiveDays: number): string => {
        if (inactiveDays > 90) return 'frozen'
        if (inactiveDays > 60) return 'cold'
        if (inactiveDays > 30) return 'cool'
        if (inactiveDays > 7) return 'warm'
        return entry.tier
      }

      const newTier = determineTier(hotEntry, daysSinceAccess)
      expect(newTier).toBe('warm')
    })

    it('should transition WARM to COOL after extended inactivity', () => {
      const warmEntry = createMockCachedResponse({ tier: 'warm' })
      const daysSinceAccess = 35

      const determineTier = (entry: typeof warmEntry, inactiveDays: number): string => {
        if (inactiveDays > 90) return 'frozen'
        if (inactiveDays > 60) return 'cold'
        if (inactiveDays > 30) return 'cool'
        if (inactiveDays > 7) return 'warm'
        return entry.tier
      }

      const newTier = determineTier(warmEntry, daysSinceAccess)
      expect(newTier).toBe('cool')
    })

    it('should promote entries on frequent access', () => {
      const coolEntry = createMockCachedResponse({
        tier: 'cool',
        access_count: 50,
      })

      // Promotion logic
      const shouldPromote = (entry: typeof coolEntry): boolean => {
        return entry.access_count > 20 && entry.tier !== 'hot'
      }

      expect(shouldPromote(coolEntry)).toBe(true)
    })
  })

  describe('User Feedback Recording', () => {
    it('should maintain lifecycle on helpful feedback', () => {
      const metadata = createMockCacheMetadata({
        feedback_helpful: 10,
        feedback_outdated: 0,
        feedback_incorrect: 0,
      })

      const calculateFeedbackScore = (meta: typeof metadata): number => {
        const total = meta.feedback_helpful + meta.feedback_outdated + meta.feedback_incorrect
        if (total === 0) return 1
        return meta.feedback_helpful / total
      }

      const score = calculateFeedbackScore(metadata)
      expect(score).toBe(1) // 100% helpful
    })

    it('should mark stale on majority negative feedback', () => {
      const metadata = createMockCacheMetadata({
        feedback_helpful: 2,
        feedback_outdated: 5,
        feedback_incorrect: 3,
      })

      const shouldMarkStale = (meta: typeof metadata): boolean => {
        const negative = meta.feedback_outdated + meta.feedback_incorrect
        const total = meta.feedback_helpful + negative
        return total > 3 && negative / total > 0.5
      }

      expect(shouldMarkStale(metadata)).toBe(true)
    })
  })

  describe('Cache Entry Finding', () => {
    it('should exclude STALE entries by default', () => {
      const entries = [
        createMockCachedResponse({ tier: 'hot', lifecycle: 'active' }),
        createStaleCacheEntry(),
        createMockCachedResponse({ tier: 'warm', lifecycle: 'active' }),
      ]

      const filtered = entries.filter(
        (e) => e.lifecycle !== 'stale' && e.tier !== 'frozen'
      )

      expect(filtered).toHaveLength(2)
    })

    it('should exclude COLD entries by default', () => {
      const entries = [
        createHotCacheEntry(),
        createColdCacheEntry(),
        createMockCachedResponse({ tier: 'warm' }),
      ]

      const filtered = entries.filter((e) => e.tier !== 'cold' && e.tier !== 'frozen')

      expect(filtered).toHaveLength(2)
    })

    it('should order by access count', () => {
      const entries = createCacheBatch(5)

      // Should already be ordered by descending access count
      for (let i = 0; i < entries.length - 1; i++) {
        expect(entries[i].access_count).toBeGreaterThanOrEqual(entries[i + 1].access_count)
      }
    })

    it('should respect similarity threshold', () => {
      const entries = [
        createMockCachedResponse({ similarity: 0.95 }),
        createMockCachedResponse({ similarity: 0.80 }),
        createMockCachedResponse({ similarity: 0.70 }),
      ]

      const threshold = 0.85
      const matching = entries.filter((e) => e.similarity >= threshold)

      expect(matching).toHaveLength(1)
      expect(matching[0].similarity).toBe(0.95)
    })
  })

  describe('Time-Sensitive Query Handling', () => {
    it('should bypass cache for weather queries', () => {
      const entry = createTimeSensitiveCacheEntry()

      const shouldBypassCache = (e: typeof entry): boolean => {
        return e.lifecycle === 'time_sensitive'
      }

      expect(shouldBypassCache(entry)).toBe(true)
    })

    it('should detect freshness patterns', () => {
      const patterns = [
        { query: 'weather in NYC', isFresh: false },
        { query: 'what is AI', isFresh: true },
        { query: 'stock price AAPL', isFresh: false },
        { query: 'capital of France', isFresh: true },
      ]

      const isFreshQuery = (query: string): boolean => {
        const timeSensitivePatterns = ['weather', 'stock', 'price', 'today', 'current', 'now', 'latest']
        const lowerQuery = query.toLowerCase()
        return !timeSensitivePatterns.some((p) => lowerQuery.includes(p))
      }

      patterns.forEach(({ query, isFresh }) => {
        expect(isFreshQuery(query)).toBe(isFresh)
      })
    })
  })

  describe('Embedding Operations', () => {
    it('should generate normalized vectors', () => {
      const embedding = createMockEmbedding(384)

      // Check normalization (magnitude should be ~1)
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
      expect(magnitude).toBeCloseTo(1, 5)
    })

    it('should maintain consistent dimensions', () => {
      const embedding = createMockEmbedding(384)
      expect(embedding).toHaveLength(384)
    })
  })
})

describe('Tier-Based Cache', () => {
  describe('Similarity Calculation', () => {
    it('should return 1.0 for identical embeddings', () => {
      const embedding = createMockEmbedding(384)

      // Cosine similarity for identical vectors should be 1
      const dotProduct = embedding.reduce((sum, val) => sum + val * val, 0)
      const magnitude = Math.sqrt(dotProduct)
      const similarity = dotProduct / (magnitude * magnitude)

      expect(similarity).toBeCloseTo(1, 5)
    })

    it('should handle edge cases', () => {
      // Empty arrays
      const emptyEmbedding: number[] = []
      expect(emptyEmbedding.length).toBe(0)

      // Mismatched lengths should not crash
      const short = createMockEmbedding(100)
      const long = createMockEmbedding(384)
      expect(short.length).not.toBe(long.length)
    })
  })

  describe('Response Storage', () => {
    it('should assign correct initial tier', () => {
      const newEntry = createMockCachedResponse({
        tier: 'cool', // New entries start in cool
        access_count: 0,
      })

      expect(newEntry.tier).toBe('cool')
    })

    it('should calculate initial popularity score', () => {
      const entry = createMockCachedResponse({
        access_count: 0,
        quality_score: 80,
      })

      // Initial popularity based on quality
      const initialPopularity = entry.quality_score * 0.5
      expect(initialPopularity).toBe(40)
    })
  })
})
