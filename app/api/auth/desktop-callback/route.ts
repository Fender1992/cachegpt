import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Desktop OAuth callback — receives the OAuth code from the provider,
 * exchanges it for a Supabase session, then redirects to the cachegpt:// deep link
 * so the desktop app can capture the tokens.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'Missing OAuth code' }, { status: 400 })
  }

  // Create a Supabase client to exchange the code
  const response = NextResponse.next()
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
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.session) {
      return NextResponse.json(
        { error: error?.message || 'Failed to exchange code for session' },
        { status: 400 }
      )
    }

    // Build deep link URL with tokens
    const deepLinkUrl = new URL('cachegpt://auth')
    deepLinkUrl.searchParams.set('access_token', data.session.access_token)
    deepLinkUrl.searchParams.set('refresh_token', data.session.refresh_token)
    const deepLink = deepLinkUrl.toString()

    // Return an HTML page that redirects via JS (NextResponse.redirect doesn't
    // work reliably for custom schemes like cachegpt://)
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirecting...</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb">
<div style="text-align:center">
<p>Signing you in...</p>
<p style="margin-top:1rem;font-size:0.875rem;color:#6b7280">If the app doesn't open automatically, <a href="${deepLink}">click here</a>.</p>
</div>
<script>window.location.href=${JSON.stringify(deepLink)};</script>
</body></html>`

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('Desktop callback error:', err)
    return NextResponse.json(
      { error: 'Internal server error during OAuth exchange' },
      { status: 500 }
    )
  }
}
