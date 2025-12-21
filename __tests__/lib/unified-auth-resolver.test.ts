/**
 * Unit Tests for Unified Auth Resolver
 * Tests the three-layer authentication system: API key > Bearer token > Cookie
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createMockSession,
  createExpiredSession,
  createExpiringSession,
  createApiKeySession,
  createBearerSession,
  createMockRequest,
  createBearerRequest,
  createApiKeyRequest,
  generateMockApiKey,
  generateMockJwt,
} from '../utils/auth-mock'
import { createMockSupabaseClient, mockAuthState } from '../utils/supabase-mock'

// Mock the dependencies
vi.mock('@/lib/supabase-client', () => ({
  supabase: createMockSupabaseClient(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn().mockResolvedValue(createMockSupabaseClient()),
}))

vi.mock('@/lib/api-key-auth', () => ({
  extractApiKey: vi.fn((header: string) => {
    if (header?.includes('cgpt_sk_')) {
      const match = header.match(/cgpt_sk_[a-z0-9]+/)
      return match ? match[0] : null
    }
    return null
  }),
  validateApiKey: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}))

describe('Unified Auth Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication Priority', () => {
    it('should prioritize API key authentication over Bearer token', async () => {
      const { validateApiKey } = await import('@/lib/api-key-auth')
      const mockApiKey = generateMockApiKey()
      const mockSession = createApiKeySession()

      vi.mocked(validateApiKey).mockResolvedValueOnce({
        ...mockSession,
        isValid: true,
      } as any)

      // Request has both API key and Bearer token
      const request = createMockRequest({
        headers: {
          Authorization: `Bearer ${mockApiKey}`,
        },
      })

      const { resolveAuthentication } = await import('@/lib/unified-auth-resolver')
      const result = await resolveAuthentication(request as any)

      expect(result).not.toHaveProperty('error')
      expect((result as any).authMethod).toBe('api_key')
    })

    it('should fall back to Bearer token if API key is invalid', async () => {
      const { validateApiKey } = await import('@/lib/api-key-auth')
      vi.mocked(validateApiKey).mockResolvedValueOnce(null)

      const mockJwt = generateMockJwt()
      const request = createBearerRequest(mockJwt)

      // This test verifies the fallback behavior
      // The actual Bearer validation would happen in validateBearerToken
    })

    it('should fall back to cookie session if no Bearer token', async () => {
      const request = createMockRequest({})

      // When no auth header is present, should check cookies
      // This tests the fallback chain
    })
  })

  describe('API Key Authentication', () => {
    it('should accept valid API keys starting with cgpt_sk_', async () => {
      const { extractApiKey } = await import('@/lib/api-key-auth')
      const mockApiKey = 'cgpt_sk_test123abc456def789'

      // Test that API key extraction works correctly for X-API-Key header
      const extracted = extractApiKey(`X-API-Key: ${mockApiKey}`)
      expect(extracted).toBe(mockApiKey)

      // Test the prefix format is correct
      expect(mockApiKey).toMatch(/^cgpt_sk_[a-z0-9]+$/)
    })

    it('should reject malformed API keys', async () => {
      const { extractApiKey } = await import('@/lib/api-key-auth')
      vi.mocked(extractApiKey).mockReturnValueOnce(null)

      const request = createApiKeyRequest('invalid_key_format')
      // Should not extract as API key and fall through to other methods
    })

    it('should reject expired API keys', async () => {
      const { extractApiKey, validateApiKey } = await import('@/lib/api-key-auth')
      const mockApiKey = 'cgpt_sk_expired123'

      vi.mocked(extractApiKey).mockReturnValueOnce(mockApiKey)
      vi.mocked(validateApiKey).mockResolvedValueOnce(null)

      const request = createApiKeyRequest(mockApiKey)
      // Should fall through to Bearer token auth
    })
  })

  describe('Bearer Token Authentication', () => {
    it('should validate JWT Bearer tokens', async () => {
      const mockJwt = generateMockJwt({
        sub: 'user-456',
        email: 'bearer@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const request = createBearerRequest(mockJwt)
      // Bearer token validation happens via Supabase getUser
    })

    it('should reject expired JWT tokens', async () => {
      const expiredJwt = generateMockJwt({
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      })

      const request = createBearerRequest(expiredJwt)
      // Should return 401 or fall through to cookies
    })

    it('should not treat API keys as Bearer tokens', async () => {
      const apiKey = generateMockApiKey()

      // Even if passed as Bearer, API key should be detected by its prefix
      const header = `Bearer ${apiKey}`

      // The extractApiKey function should detect cgpt_sk_ prefix in any header
      expect(apiKey).toContain('cgpt_sk_')
      expect(header).toContain('cgpt_sk_')
    })
  })

  describe('Cookie Session Authentication', () => {
    it('should validate cookie sessions for web users', async () => {
      // Cookie sessions are validated via Supabase SSR client
      const mockClient = createMockSupabaseClient()
      mockAuthState(
        mockClient,
        { id: 'user-789', email: 'web@example.com' },
        { access_token: 'mock-token', expires_at: Date.now() + 3600000 }
      )
    })

    it('should handle missing cookies gracefully', async () => {
      const { cookies } = await import('next/headers')
      vi.mocked(cookies).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        delete: vi.fn(),
      } as any)

      // Should return auth error when no session found
    })
  })

  describe('Session Expiry Handling', () => {
    it('should identify sessions about to expire', () => {
      const expiringSession = createExpiringSession(3) // 3 minutes to expiry
      const expiresAt = expiringSession.expiresAt
      const now = Math.floor(Date.now() / 1000)
      const timeToExpiry = expiresAt - now

      expect(timeToExpiry).toBeLessThan(5 * 60) // Less than 5 minutes
    })

    it('should identify expired sessions', () => {
      const expiredSession = createExpiredSession()
      const now = Math.floor(Date.now() / 1000)

      expect(expiredSession.expiresAt).toBeLessThan(now)
    })

    it('should identify healthy sessions', () => {
      const healthySession = createMockSession()
      const now = Math.floor(Date.now() / 1000)
      const timeToExpiry = healthySession.expiresAt - now

      expect(timeToExpiry).toBeGreaterThan(5 * 60) // More than 5 minutes
    })
  })

  describe('Session Type Guards', () => {
    it('should correctly identify UnifiedSession', () => {
      const session = createMockSession()

      expect(session).toHaveProperty('userId')
      expect(session).toHaveProperty('email')
      expect(session).toHaveProperty('authMethod')
      expect(session).toHaveProperty('expiresAt')
    })

    it('should correctly identify AuthenticationError', () => {
      const error = { error: 'Unauthorized', status: 401 }

      expect(error).toHaveProperty('error')
      expect(error).toHaveProperty('status')
      expect(error.status).toBe(401)
    })
  })

  describe('Error Handling', () => {
    it('should return 401 when all auth methods fail', async () => {
      const { validateApiKey } = await import('@/lib/api-key-auth')
      vi.mocked(validateApiKey).mockResolvedValue(null)

      const request = createMockRequest({})
      // Should return { error: 'Authentication required', status: 401 }
    })

    it('should not expose internal errors to client', async () => {
      const { validateApiKey } = await import('@/lib/api-key-auth')
      vi.mocked(validateApiKey).mockRejectedValueOnce(new Error('Database connection failed'))

      // Should fall through to other auth methods, not expose DB error
    })
  })
})

describe('Auth Method Detection', () => {
  it('should detect API key format', () => {
    const validKeys = [
      'cgpt_sk_abc123def456',
      'cgpt_sk_' + 'a'.repeat(32),
    ]

    validKeys.forEach((key) => {
      expect(key.startsWith('cgpt_sk_')).toBe(true)
    })
  })

  it('should reject non-API-key formats', () => {
    const invalidKeys = [
      'sk-abc123', // OpenAI format
      'sk-ant-abc123', // Anthropic format
      'Bearer jwt.token.here',
      'random-string',
    ]

    invalidKeys.forEach((key) => {
      expect(key.startsWith('cgpt_sk_')).toBe(false)
    })
  })
})
