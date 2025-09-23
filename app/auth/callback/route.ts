import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const source = searchParams.get('source')
  const returnTo = searchParams.get('return_to')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // Successful authentication - redirect to success page with CLI parameters
      const successUrl = new URL(`${origin}/auth/success`)

      if (source) successUrl.searchParams.set('source', source)
      if (returnTo) successUrl.searchParams.set('return_to', returnTo)

      return NextResponse.redirect(successUrl.toString())
    }
  }

  // Redirect to login page on error
  const errorUrl = new URL(`${origin}/login`)
  errorUrl.searchParams.set('error', 'auth_callback_error')

  return NextResponse.redirect(errorUrl.toString())
}