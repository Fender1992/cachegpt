/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to authentication logic, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After making changes, update the STATUS file with:
 * - What changed and why
 * - Impact on authentication flow
 * - Any breaking changes or new requirements
 */

import { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
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
  expiresAt?: number; // Unix timestamp when session expires
  refreshToken?: string; // For automatic session refresh
  issuedAt: number; // Unix timestamp when session was created
  lastValidated?: number; // Unix timestamp when session was last validated
}

export interface AuthenticationError {
  error: string;
  status: number;
}

export type AuthResult = UnifiedSession | AuthenticationError;

/**
 * Resolve authentication from either Bearer token or cookies
 * Tries Bearer token first (explicit auth), then cookies (implicit auth)
 * Includes automatic session refresh and expiry handling
 */
export async function resolveAuthentication(request: NextRequest): Promise<AuthResult> {
  // Priority 1: Check for Bearer token (CLI users, explicit auth)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const bearerResult = await validateBearerToken(token);
      if (bearerResult) {
        // Check if session needs refresh or is expired
        const refreshedSession = await handleSessionExpiry(bearerResult);
        return refreshedSession;
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
      // Check if session needs refresh or is expired
      const refreshedSession = await handleSessionExpiry(cookieResult);
      return refreshedSession;
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

    // Return unified session object with expiry tracking
    const now = Math.floor(Date.now() / 1000);

    // Parse the JWT to get actual expiry time
    let expiresAt = now + 3600; // Default to 1 hour
    try {
      const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (tokenPayload.exp) {
        expiresAt = tokenPayload.exp;
      }
    } catch (e) {
      // If we can't parse the JWT, use default expiry
      console.log('[AUTH] Could not parse JWT expiry, using default');
    }

    return {
      user: {
        id: user.user.id,
        email: user.user.email || '',
        user_metadata: user.user.user_metadata
      },
      authMethod: 'bearer',
      token: token,
      issuedAt: now,
      lastValidated: now,
      expiresAt: expiresAt
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
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Cookie session error:', error.message);
      return null;
    }

    if (!session || !session.user) {
      return null;
    }

    // Return unified session object with expiry tracking
    const now = Math.floor(Date.now() / 1000);
    return {
      user: {
        id: session.user.id,
        email: session.user.email || '',
        user_metadata: session.user.user_metadata
      },
      authMethod: 'cookie',
      token: session.access_token,
      refreshToken: session.refresh_token,
      issuedAt: now,
      lastValidated: now,
      // Use session expiry if available, otherwise default to 1 hour
      expiresAt: session.expires_at || (now + 3600)
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
 * Handle session expiry with automatic refresh and graceful degradation
 */
async function handleSessionExpiry(session: UnifiedSession): Promise<AuthResult> {
  const now = Math.floor(Date.now() / 1000);

  // Check if session is expired
  if (session.expiresAt && now >= session.expiresAt) {
    console.log(`[AUTH] Session expired for user ${session.user.id}, attempting refresh`);

    // Try to refresh the session
    const refreshedSession = await refreshSession(session);
    if (refreshedSession) {
      return refreshedSession;
    }

    // If refresh failed, return error with helpful message
    return {
      error: 'Your session has expired. Please log in again to continue.',
      status: 401
    };
  }

  // Check if session expires soon (within 5 minutes) and needs refresh
  const fiveMinutes = 5 * 60;
  if (session.expiresAt && (session.expiresAt - now) < fiveMinutes) {
    console.log(`[AUTH] Session expires soon for user ${session.user.id}, proactively refreshing`);

    // Try proactive refresh, but don't fail if it doesn't work
    const refreshedSession = await refreshSession(session);
    if (refreshedSession) {
      return refreshedSession;
    }

    // If proactive refresh failed, log warning but continue with current session
    console.warn(`[AUTH] Proactive refresh failed for user ${session.user.id}, continuing with current session`);
  }

  // Update last validated timestamp
  session.lastValidated = now;
  return session;
}

/**
 * Attempt to refresh a session using available refresh token
 */
async function refreshSession(session: UnifiedSession): Promise<UnifiedSession | null> {
  try {
    // Only attempt refresh for cookie sessions with refresh tokens
    if (session.authMethod === 'cookie' && session.refreshToken) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: session.refreshToken
      });

      if (error || !data.session) {
        console.error('[AUTH] Session refresh failed:', error?.message);
        return null;
      }

      const now = Math.floor(Date.now() / 1000);
      return {
        ...session,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at || (now + 3600),
        lastValidated: now
      };
    }

    // For Bearer tokens, we can't refresh them - they need to be re-issued
    console.log('[AUTH] Cannot refresh Bearer token, requires re-authentication');
    return null;

  } catch (error) {
    console.error('[AUTH] Session refresh exception:', error);
    return null;
  }
}

/**
 * Check if a session is healthy (not expired and not expiring soon)
 */
export function isSessionHealthy(session: UnifiedSession): boolean {
  if (!session.expiresAt) {
    return true; // No expiry info, assume healthy
  }

  const now = Math.floor(Date.now() / 1000);
  const tenMinutes = 10 * 60;

  // Session is healthy if it doesn't expire within 10 minutes
  return (session.expiresAt - now) > tenMinutes;
}

/**
 * Get time until session expires in seconds
 */
export function getSessionTimeToExpiry(session: UnifiedSession): number | null {
  if (!session.expiresAt) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, session.expiresAt - now);
}

/**
 * Create enhanced error message based on session state
 */
export function createSessionErrorMessage(session: UnifiedSession, originalError: string): string {
  const timeToExpiry = getSessionTimeToExpiry(session);

  if (timeToExpiry === null) {
    return originalError;
  }

  if (timeToExpiry <= 0) {
    if (session.authMethod === 'bearer') {
      return 'Your authentication token has expired. Please run `cachegpt login` to authenticate again.';
    } else {
      return 'Your session has expired. Please refresh the page and log in again.';
    }
  }

  if (timeToExpiry < 300) { // Less than 5 minutes
    return `${originalError} (Note: Your session expires in ${Math.floor(timeToExpiry / 60)} minutes)`;
  }

  return originalError;
}

/**
 * Debug helper to log auth method usage
 */
export function logAuthMethodUsage(session: UnifiedSession, endpoint: string): void {
  const timeToExpiry = getSessionTimeToExpiry(session);
  const expiryInfo = timeToExpiry !== null ? ` (expires in ${Math.floor(timeToExpiry / 60)}m)` : '';
  console.log(`[AUTH] ${endpoint}: User ${session.user.id} authenticated via ${session.authMethod}${expiryInfo}`);
}