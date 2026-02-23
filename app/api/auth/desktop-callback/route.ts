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

    // Redirect to the desktop app via deep link with tokens
    const deepLinkUrl = new URL('cachegpt://auth')
    deepLinkUrl.searchParams.set('access_token', data.session.access_token)
    deepLinkUrl.searchParams.set('refresh_token', data.session.refresh_token)

    return NextResponse.redirect(deepLinkUrl.toString())
  } catch (err) {
    console.error('Desktop callback error:', err)
    return NextResponse.json(
      { error: 'Internal server error during OAuth exchange' },
      { status: 500 }
    )
  }
}
