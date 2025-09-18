import { CacheGPT } from '@/sdk/javascript/src/client'
import { AuthenticationError, RateLimitError } from '@/sdk/javascript/src/exceptions'

// Mock fetch
global.fetch = jest.fn()

describe('CacheGPT JavaScript SDK', () => {
  let client: CacheGPT

  beforeEach(() => {
    client = new CacheGPT({ apiKey: 'test-key' })
    jest.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should require API key', () => {
      expect(() => new CacheGPT({ apiKey: '' })).toThrow(AuthenticationError)
    })

    it('should include API key in headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Response' })
      })

      await client.chat('Hello')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key'
          })
        })
      )
    })
  })

  describe('Chat functionality', () => {
    it('should send simple messages', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          content: 'Hello! How can I help you?',
          cached: false,
          similarity: 0
        })
      })

      const response = await client.chat('Hello')

      expect(response.content).toBe('Hello! How can I help you?')
      expect(response.cached).toBe(false)
    })

    it('should support message arrays', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Response' })
      })

      await client.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' }
      ])

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"role":"system"')
        })
      )
    })

    it('should handle chat options', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Response' })
      })

      await client.chat('Hello', {
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 100
      })

      const callArgs = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)

      expect(body.model).toBe('gpt-4')
      expect(body.temperature).toBe(0.5)
      expect(body.max_tokens).toBe(100)
    })
  })

  describe('Error handling', () => {
    it('should handle rate limits', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '60' })
      })

      await expect(client.chat('Hello')).rejects.toThrow(RateLimitError)
    })

    it('should handle authentication errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401
      })

      await expect(client.chat('Hello')).rejects.toThrow(AuthenticationError)
    })

    it('should retry on network errors', async () => {
      let attempts = 0
      ;(global.fetch as jest.Mock).mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          return Promise.reject(new TypeError('Network request failed'))
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: 'Success' })
        })
      })

      const response = await client.chat('Hello')

      expect(response.content).toBe('Success')
      expect(attempts).toBe(3)
    })
  })

  describe('Statistics and usage', () => {
    it('should fetch usage data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          daily: { requests: 100, tokens_used: 50000 },
          monthly: { requests: 3000, tokens_used: 1500000 }
        })
      })

      const usage = await client.getUsage()

      expect(usage.daily.requests).toBe(100)
      expect(usage.monthly.requests).toBe(3000)
    })

    it('should fetch cache statistics', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          total_requests: 1000,
          cache_hits: 850,
          hit_rate: 0.85,
          total_saved: 42.50
        })
      })

      const stats = await client.getStats(7)

      expect(stats.total_requests).toBe(1000)
      expect(stats.hit_rate).toBe(0.85)
      expect(stats.total_saved).toBe(42.50)
    })
  })

  describe('Cache management', () => {
    it('should clear cache', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ deleted: 150 })
      })

      const result = await client.clearCache(24)

      expect(result.deleted).toBe(150)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/cache/clear'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ older_than_hours: 24 })
        })
      )
    })
  })

  describe('Streaming', () => {
    it('should support streaming responses', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"content":"Hello"}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: {"content":" world"}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        }
      })

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream
      })

      const stream = client.streamChat('Hello')
      const chunks: string[] = []

      for await (const chunk of stream) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', ' world'])
    })
  })
})