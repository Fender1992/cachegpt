import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Unified authentication resolver
 * Handles both Bearer token and cookie authentication consistently
 */

export interface UnifiedSession {
  user: {
    id: string;
    email: string;
    user_metadata?: any;
  };
  authMethod: 'cookie' | 'bearer';
  token: string;
  provider?: string; // For tracking which provider the user authenticated with
}

export interface AuthenticationError {
  error: string;
  status: number;
}

export type AuthResult = UnifiedSession | AuthenticationError;

/**
 * Resolve authentication from either Bearer token or cookies
 * Tries Bearer token first (explicit auth), then cookies (implicit auth)
 */
export async function resolveAuthentication(request: NextRequest): Promise<AuthResult> {
  // Priority 1: Check for Bearer token (CLI users, explicit auth)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const bearerResult = await validateBearerToken(token);
      if (bearerResult) {
        return bearerResult;
      }
    } catch (error) {
      console.error('Bearer token validation failed:', error);
      // Don't return error here, fall back to cookies
    }
  }

  // Priority 2: Check for cookie session (web users, implicit auth)
  try {
    const cookieResult = await validateCookieSession();
    if (cookieResult) {
      return cookieResult;
    }
  } catch (error) {
    console.error('Cookie session validation failed:', error);
  }

  // No valid authentication found
  return {
    error: 'No valid authentication found. Please login or provide a valid Bearer token.',
    status: 401
  };
}

/**
 * Validate Bearer token using Supabase admin client
 */
async function validateBearerToken(token: string): Promise<UnifiedSession | null> {
  if (!token || token.trim().length === 0) {
    return null;
  }

  try {
    // Use Supabase admin client to validate the token
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: user, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user?.user) {
      console.error('Bearer token validation error:', error?.message);
      return null;
    }

    // Return unified session object
    return {
      user: {
        id: user.user.id,
        email: user.user.email || '',
        user_metadata: user.user.user_metadata
      },
      authMethod: 'bearer',
      token: token
    };

  } catch (error) {
    console.error('Bearer token validation exception:', error);
    return null;
  }
}

/**
 * Validate cookie session using route handler client
 */
async function validateCookieSession(): Promise<UnifiedSession | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    );
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Cookie session error:', error.message);
      return null;
    }

    if (!session || !session.user) {
      return null;
    }

    // Return unified session object
    return {
      user: {
        id: session.user.id,
        email: session.user.email || '',
        user_metadata: session.user.user_metadata
      },
      authMethod: 'cookie',
      token: session.access_token
    };

  } catch (error) {
    console.error('Cookie session exception:', error);
    return null;
  }
}

/**
 * Type guard to check if auth result is a session
 */
export function isUnifiedSession(result: AuthResult): result is UnifiedSession {
  return 'user' in result && 'authMethod' in result;
}

/**
 * Type guard to check if auth result is an error
 */
export function isAuthError(result: AuthResult): result is AuthenticationError {
  return 'error' in result && 'status' in result;
}

/**
 * Extract user ID from auth result for logging
 */
export function getUserId(session: UnifiedSession): string {
  return session.user.id;
}

/**
 * Create a Supabase client using the unified session token
 * This ensures consistent database access regardless of auth method
 */
export function createUnifiedSupabaseClient(session: UnifiedSession) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      }
    }
  );
}

/**
 * Debug helper to log auth method usage
 */
export function logAuthMethodUsage(session: UnifiedSession, endpoint: string): void {
  console.log(`[AUTH] ${endpoint}: User ${session.user.id} authenticated via ${session.authMethod}`);
}