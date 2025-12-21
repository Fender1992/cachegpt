/**
 * Supabase Client Mock for Unit Tests
 * Provides a mock implementation of the Supabase client for testing
 */

import { vi } from 'vitest'

export interface MockSupabaseClient {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  auth: {
    getUser: ReturnType<typeof vi.fn>
    getSession: ReturnType<typeof vi.fn>
    admin: {
      getUserById: ReturnType<typeof vi.fn>
    }
  }
  storage: {
    from: ReturnType<typeof vi.fn>
  }
}

/**
 * Creates a mock Supabase client with chainable methods
 */
export function createMockSupabaseClient(): MockSupabaseClient {
  const chainableMock = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    containedBy: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockResolvedValue({ data: [], error: null }),
  }

  const fromMock = vi.fn().mockReturnValue(chainableMock)

  return {
    from: fromMock,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
      }),
    },
  }
}

/**
 * Helper to set up mock responses for database queries
 */
export function mockDatabaseQuery(
  client: MockSupabaseClient,
  table: string,
  response: { data?: unknown; error?: Error | null }
) {
  const chainable = client.from(table)
  chainable.single.mockResolvedValue(response)
  chainable.maybeSingle.mockResolvedValue(response)
  return chainable
}

/**
 * Helper to set up mock auth state
 */
export function mockAuthState(
  client: MockSupabaseClient,
  user: { id: string; email: string } | null,
  session: { access_token: string; expires_at: number } | null = null
) {
  client.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  })

  client.auth.getSession.mockResolvedValue({
    data: {
      session: session
        ? {
            ...session,
            user,
            refresh_token: 'mock-refresh-token',
          }
        : null,
    },
    error: null,
  })
}
