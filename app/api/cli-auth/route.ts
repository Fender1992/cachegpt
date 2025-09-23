import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    const supabase = createRouteHandlerClient({ cookies })

    // Sign in with email/password
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (data.session) {
      // Save CLI session to database
      await supabase.from('cli_auth_sessions').upsert({
        user_id: data.user.id,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_email: data.user.email || '',
        expires_at: data.session.expires_at,
        status: 'authenticated',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

      return NextResponse.json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        }
      })
    }

    return NextResponse.json({ error: 'No session created' }, { status: 401 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Check current session
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}