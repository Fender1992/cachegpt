import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from './middleware/rateLimit'
import { getApiVersion, addVersionHeaders } from './middleware/api-version'

export async function middleware(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request)
  if (rateLimitResult.status === 429) {
    return rateLimitResult
  }

  // Create response with security headers
  let response = NextResponse.next()

  // Add API versioning headers for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const version = getApiVersion(request)
    response = addVersionHeaders(response, version)
  }

  // Security Headers
  const headers = response.headers

  // Content Security Policy
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.vercel-insights.com https://vercel.live; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.cachegpt.io https://*.supabase.co wss://*.supabase.co https://*.sentry.io; " +
    "frame-ancestors 'none';"
  )

  // Other Security Headers
  headers.set('X-DNS-Prefetch-Control', 'on')
  headers.set('X-Frame-Options', 'SAMEORIGIN')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-XSS-Protection', '1; mode=block')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // HSTS (Strict Transport Security)
  if (process.env.NODE_ENV === 'production') {
    headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  return response
}

// Configure which routes to apply middleware to
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}