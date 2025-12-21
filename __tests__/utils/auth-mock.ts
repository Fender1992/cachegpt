/**
 * Authentication Mock Utilities for Unit Tests
 * Provides mock sessions, requests, and auth tokens for testing
 */

import { vi } from 'vitest'

export interface MockUnifiedSession {
  userId: string
  email: string
  authMethod: 'cookie' | 'bearer' | 'api_key'
  token?: string
  keyId?: string
  expiresAt: number
}

export interface MockAuthError {
  code: string
  message: string
  statusCode: number
}

/**
 * Creates a mock unified session with default values
 */
export function createMockSession(overrides: Partial<MockUnifiedSession> = {}): MockUnifiedSession {
  return {
    userId: 'test-user-123',
    email: 'test@example.com',
    authMethod: 'cookie',
    expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    ...overrides,
  }
}

/**
 * Creates a mock session that's about to expire (for testing refresh)
 */
export function createExpiringSession(minutesUntilExpiry: number = 3): MockUnifiedSession {
  return createMockSession({
    expiresAt: Math.floor(Date.now() / 1000) + minutesUntilExpiry * 60,
  })
}

/**
 * Creates an expired mock session
 */
export function createExpiredSession(): MockUnifiedSession {
  return createMockSession({
    expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  })
}

/**
 * Creates a mock API key session
 */
export function createApiKeySession(keyId: string = 'key-123'): MockUnifiedSession {
  return createMockSession({
    authMethod: 'api_key',
    keyId,
    token: undefined,
  })
}

/**
 * Creates a mock bearer token session (for CLI/API)
 */
export function createBearerSession(token: string = 'mock-jwt-token'): MockUnifiedSession {
  return createMockSession({
    authMethod: 'bearer',
    token,
  })
}

/**
 * Creates a mock auth error
 */
export function createAuthError(
  code: string = 'UNAUTHORIZED',
  message: string = 'Authentication required',
  statusCode: number = 401
): MockAuthError {
  return { code, message, statusCode }
}

/**
 * Creates a mock HTTP request with optional auth headers
 */
export function createMockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  cookies?: Record<string, string>
} = {}): Request {
  const {
    method = 'POST',
    url = 'http://localhost:3000/api/test',
    headers = {},
    body,
  } = options

  const requestHeaders = new Headers({
    'Content-Type': 'application/json',
    ...headers,
  })

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Creates a mock request with Bearer token auth
 */
export function createBearerRequest(token: string, body?: unknown): Request {
  return createMockRequest({
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
}

/**
 * Creates a mock request with API key auth
 */
export function createApiKeyRequest(apiKey: string, body?: unknown): Request {
  return createMockRequest({
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  })
}

/**
 * Generates a mock API key in CacheGPT format
 */
export function generateMockApiKey(): string {
  const randomPart = Math.random().toString(36).substring(2, 34)
  return `cgpt_sk_${randomPart}`
}

/**
 * Generates a mock JWT token
 */
export function generateMockJwt(payload: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const defaultPayload = {
    sub: 'test-user-123',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...payload,
  }
  const payloadStr = btoa(JSON.stringify(defaultPayload))
  const signature = btoa('mock-signature')
  return `${header}.${payloadStr}.${signature}`
}

/**
 * Mock function for the unified auth resolver
 */
export function createMockAuthResolver() {
  return {
    resolveAuth: vi.fn(),
    isSessionHealthy: vi.fn().mockReturnValue(true),
    getSessionTimeToExpiry: vi.fn().mockReturnValue(3600),
  }
}
