import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const source = requestUrl.searchParams.get('source')
  const returnTo = requestUrl.searchParams.get('return_to')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to success page with CLI parameters if present
  const successUrl = new URL('/auth/success', requestUrl.origin)
  if (source) successUrl.searchParams.set('source', source)
  if (returnTo) successUrl.searchParams.set('return_to', returnTo)

  return NextResponse.redirect(successUrl)
}