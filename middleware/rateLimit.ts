import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Different rate limiters for different endpoints
const rateLimiters = {
  // API endpoints - more restrictive
  api: new RateLimiterMemory({
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
    blockDuration: 60, // Block for 1 minute
  }),

  // Chat endpoint - moderate limits
  chat: new RateLimiterMemory({
    points: 50,
    duration: 60,
    blockDuration: 120, // Block for 2 minutes
  }),

  // Auth endpoints - very restrictive
  auth: new RateLimiterMemory({
    points: 5,
    duration: 60,
    blockDuration: 900, // Block for 15 minutes
  }),

  // General pages - lenient
  general: new RateLimiterMemory({
    points: 200,
    duration: 60,
    blockDuration: 10,
  }),
};

// IP-based rate limiting with different tiers
const ipRateLimiter = new RateLimiterMemory({
  points: 1000, // Total requests per IP
  duration: 3600, // Per hour
  blockDuration: 3600, // Block for 1 hour
});

// Get client IP address
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() :
             request.headers.get('x-real-ip') ||
             request.ip ||
             '127.0.0.1';
  return ip;
}

// Determine which rate limiter to use based on path
function getRateLimiter(pathname: string) {
  if (pathname.startsWith('/api/chat')) return rateLimiters.chat;
  if (pathname.startsWith('/api/auth') || pathname.includes('login') || pathname.includes('signup')) return rateLimiters.auth;
  if (pathname.startsWith('/api/')) return rateLimiters.api;
  return rateLimiters.general;
}

export async function rateLimit(request: NextRequest) {
  const ip = getClientIp(request);
  const pathname = request.nextUrl.pathname;
  const limiter = getRateLimiter(pathname);

  try {
    // Check IP-based rate limit first
    await ipRateLimiter.consume(ip, 1);

    // Then check endpoint-specific rate limit
    const key = `${ip}:${pathname}`;
    await limiter.consume(key, 1);

    // Add rate limit headers to response
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', limiter.points.toString());
    response.headers.set('X-RateLimit-Remaining', (limiter.points - 1).toString());
    response.headers.set('X-RateLimit-Reset', new Date(Date.now() + limiter.duration * 1000).toISOString());

    return response;
  } catch (error: any) {
    // Rate limit exceeded
    const retryAfter = Math.round(error.msBeforeNext / 1000) || 60;

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
          'X-RateLimit-Limit': limiter.points.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(Date.now() + retryAfter * 1000).toISOString(),
        },
      }
    );
  }
}

// Advanced rate limiting with user tiers
export class UserRateLimiter {
  private limits = {
    free: {
      requests: 1000,
      duration: 86400, // 24 hours
    },
    premium: {
      requests: 10000,
      duration: 86400,
    },
    enterprise: {
      requests: 100000,
      duration: 86400,
    },
  };

  private userLimiters = new Map<string, RateLimiterMemory>();

  getRateLimiter(userId: string, tier: 'free' | 'premium' | 'enterprise' = 'free') {
    const key = `${userId}:${tier}`;

    if (!this.userLimiters.has(key)) {
      const limit = this.limits[tier];
      this.userLimiters.set(key, new RateLimiterMemory({
        points: limit.requests,
        duration: limit.duration,
        blockDuration: 3600, // Block for 1 hour when exceeded
      }));
    }

    return this.userLimiters.get(key)!;
  }

  async checkLimit(userId: string, tier: 'free' | 'premium' | 'enterprise' = 'free', points: number = 1) {
    const limiter = this.getRateLimiter(userId, tier);

    try {
      const result = await limiter.consume(userId, points);
      return {
        allowed: true,
        remaining: result.remainingPoints,
        resetAt: new Date(Date.now() + result.msBeforeNext),
      };
    } catch (error: any) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + error.msBeforeNext),
        retryAfter: Math.round(error.msBeforeNext / 1000),
      };
    }
  }

  async getRemainingQuota(userId: string, tier: 'free' | 'premium' | 'enterprise' = 'free') {
    const limiter = this.getRateLimiter(userId, tier);
    const key = userId;

    try {
      const result = await limiter.get(key);
      if (!result) {
        return {
          used: 0,
          remaining: limiter.points,
          total: limiter.points,
          resetAt: new Date(Date.now() + limiter.duration * 1000),
        };
      }

      return {
        used: result.consumedPoints,
        remaining: result.remainingPoints,
        total: limiter.points,
        resetAt: new Date(Date.now() + result.msBeforeNext),
      };
    } catch (error) {
      return {
        used: 0,
        remaining: limiter.points,
        total: limiter.points,
        resetAt: new Date(Date.now() + limiter.duration * 1000),
      };
    }
  }
}