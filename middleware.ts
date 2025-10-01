import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit } from './middleware/rateLimit-simple'
import { getApiVersion, addVersionHeaders } from './middleware/api-version'

export async function middleware(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request)
  if (rateLimitResult.status === 429) {
    return rateLimitResult
  }

  // Create response
  let response = NextResponse.next()

  // Handle Supabase auth - refresh session and set cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // This will refresh the session if needed
  await supabase.auth.getUser()

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