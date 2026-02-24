import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit } from './middleware/rateLimit-simple'
import { getApiVersion, addVersionHeaders } from './middleware/api-version'

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  const userAgent = request.headers.get('user-agent') || ''
  // Tauri sends different origins depending on platform: macOS uses tauri://localhost,
  // Windows uses https://tauri.localhost, Linux WebKitGTK uses http://tauri.localhost or http://localhost
  const tauriOrigins = ['tauri://localhost', 'https://tauri.localhost', 'http://tauri.localhost', 'http://localhost']
  const isTauriOrigin = tauriOrigins.includes(origin) || (!origin && userAgent.includes('Tauri'))
  // Use the actual origin for CORS header, or fallback for empty-origin Tauri requests
  const corsOrigin = origin || 'tauri://localhost'

  // Handle CORS preflight for Tauri desktop app
  if (isTauriOrigin && request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-timezone, x-timezone-offset',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

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
    "frame-src 'self' https://www.loom.com https://vercel.live; " +
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.cachegpt.io https://*.supabase.co wss://*.supabase.co https://*.sentry.io wss://*.pusher.com wss://gateway.discord.gg https://discord.com https://cdn.discordapp.com; " +
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

  // Add CORS headers for Tauri desktop app
  if (isTauriOrigin) {
    response.headers.set('Access-Control-Allow-Origin', corsOrigin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  return response
}

// Configure which routes to apply middleware to
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}