import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiting for Edge Runtime compatibility
// WARNING: This implementation uses local Map storage which does NOT work
// in multi-instance production deployments. Rate limits are per-instance only.
//
// TODO: Replace with shared backend for production:
// - Option 1: Supabase table (cachegpt_rate_limits with user_id/ip, count, reset_time)
// - Option 2: Redis/Upstash (if available)
// - Option 3: Vercel KV (for Vercel deployments)
//
// For now: Disabled in production unless ENABLE_LOCAL_RATE_LIMIT=true
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMITS = {
  api: { points: 100, duration: 60000 }, // 100 requests per minute
  chat: { points: 50, duration: 60000 }, // 50 requests per minute
  auth: { points: 5, duration: 60000 }, // 5 requests per minute
  general: { points: 200, duration: 60000 }, // 200 requests per minute
};

// Get client IP address
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() :
             request.headers.get('x-real-ip') ||
             '127.0.0.1';
  return ip;
}

// Determine which rate limiter to use based on path
function getRateLimit(pathname: string) {
  if (pathname.startsWith('/api/chat')) return RATE_LIMITS.chat;
  if (pathname.startsWith('/api/auth') || pathname.includes('login') || pathname.includes('signup')) return RATE_LIMITS.auth;
  if (pathname.startsWith('/api/')) return RATE_LIMITS.api;
  return RATE_LIMITS.general;
}

// Clean up old entries periodically
function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (value.resetTime < now) {
      requestCounts.delete(key);
    }
  }
}

export async function rateLimit(request: NextRequest) {
  // Skip rate limiting in production multi-instance deployments
  // (in-memory Map doesn't work across instances)
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_LOCAL_RATE_LIMIT !== 'true') {
    console.warn('[RATE-LIMIT] Local rate limiting disabled in production - requires shared backend');
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const pathname = request.nextUrl.pathname;
  const limit = getRateLimit(pathname);
  const key = `${ip}:${pathname}`;
  const now = Date.now();

  // Clean up old entries (every 100 requests)
  if (Math.random() < 0.01) {
    cleanupOldEntries();
  }

  // Get or create rate limit entry
  let entry = requestCounts.get(key);

  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired one
    entry = { count: 1, resetTime: now + limit.duration };
    requestCounts.set(key, entry);
  } else if (entry.count >= limit.points) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': limit.points.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
        },
      }
    );
  } else {
    // Increment counter
    entry.count++;
  }

  // Add rate limit headers to response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', limit.points.toString());
  response.headers.set('X-RateLimit-Remaining', (limit.points - entry.count).toString());
  response.headers.set('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

  return response;
}