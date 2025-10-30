import { describe, it, expect, beforeEach } from 'vitest'
import { cacheLifecycleManager, QueryType, CacheLifecycle } from '@/lib/cache-lifecycle'

describe('Cache Lifecycle Manager', () => {
  beforeEach(() => {
    // Reset any state if needed
  })

  describe('classifyQueryType', () => {
    it('should classify factual queries correctly', () => {
      const factualQueries = [
        'What is the capital of France?',
        'Who invented the telephone?',
        'Define machine learning',
      ]

      factualQueries.forEach(query => {
        const result = cacheLifecycleManager.classifyQueryType(query)
        expect(result.type).toBe(QueryType.FACTUAL)
        expect(result.confidence).toBeGreaterThan(0.5)
      })
    })

    it('should classify time-sensitive queries correctly', () => {
      const timeSensitiveQueries = [
        'What is the weather today?',
        'Latest news about AI',
        'Current stock price of Tesla',
      ]

      timeSensitiveQueries.forEach(query => {
        const result = cacheLifecycleManager.classifyQueryType(query)
        expect(result.type).toBe(QueryType.TIME_SENSITIVE)
        expect(result.confidence).toBeGreaterThan(0.5)
      })
    })

    it('should classify conversational queries correctly', () => {
      const conversationalQueries = [
        'How are you doing?',
        'Tell me a joke',
        'Can you help me with something?',
      ]

      conversationalQueries.forEach(query => {
        const result = cacheLifecycleManager.classifyQueryType(query)
        expect(result.type).toBe(QueryType.CONVERSATIONAL)
      })
    })
  })

  describe('determineLifecycle', () => {
    it('should assign IMMORTAL lifecycle to factual queries', () => {
      const query = 'What is the speed of light?'
      const type = cacheLifecycleManager.classifyQueryType(query)
      const lifecycle = cacheLifecycleManager.determineLifecycle(type.type, query)

      expect(lifecycle.tier).toBe(CacheLifecycle.IMMORTAL)
      expect(lifecycle.ttl).toBeNull() // Immortal = no expiry
    })

    it('should assign SHORT lifecycle to time-sensitive queries', () => {
      const query = 'What is the weather right now?'
      const type = cacheLifecycleManager.classifyQueryType(query)
      const lifecycle = cacheLifecycleManager.determineLifecycle(type.type, query)

      expect(lifecycle.tier).toBe(CacheLifecycle.SHORT)
      expect(lifecycle.ttl).toBeLessThanOrEqual(3600) // Max 1 hour
    })

    it('should assign appropriate lifecycle based on content', () => {
      const query = 'Explain quantum computing'
      const type = cacheLifecycleManager.classifyQueryType(query)
      const lifecycle = cacheLifecycleManager.determineLifecycle(type.type, query)

      expect(lifecycle.tier).toBeDefined()
      expect(lifecycle.ttl).toBeGreaterThanOrEqual(0)
    })
  })

  describe('shouldInvalidate', () => {
    it('should invalidate expired SHORT lifecycle caches', () => {
      const oldTimestamp = Date.now() - 7200000 // 2 hours ago
      const shouldInvalidate = cacheLifecycleManager.shouldInvalidate(
        CacheLifecycle.SHORT,
        oldTimestamp
      )

      expect(shouldInvalidate).toBe(true)
    })

    it('should not invalidate IMMORTAL caches', () => {
      const oldTimestamp = Date.now() - 31536000000 // 1 year ago
      const shouldInvalidate = cacheLifecycleManager.shouldInvalidate(
        CacheLifecycle.IMMORTAL,
        oldTimestamp
      )

      expect(shouldInvalidate).toBe(false)
    })

    it('should not invalidate recent MEDIUM lifecycle caches', () => {
      const recentTimestamp = Date.now() - 3600000 // 1 hour ago
      const shouldInvalidate = cacheLifecycleManager.shouldInvalidate(
        CacheLifecycle.MEDIUM,
        recentTimestamp
      )

      expect(shouldInvalidate).toBe(false)
    })
  })
})
