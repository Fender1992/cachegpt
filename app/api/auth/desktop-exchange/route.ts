import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Temporary token exchange for desktop OAuth.
 *
 * POST: The callback page stores tokens keyed by a random state string.
 * GET:  The desktop app polls until tokens are available, then deletes them.
 *
 * Uses a simple Supabase table `desktop_auth_pending` with columns:
 *   state TEXT PRIMARY KEY, tokens JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
 *
 * Tokens auto-expire after 5 minutes (enforced on read).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// POST — callback page stores tokens
export async function POST(request: NextRequest) {
  try {
    const { state, tokens } = await request.json()
    if (!state || !tokens) {
      return NextResponse.json({ error: 'Missing state or tokens' }, { status: 400, headers: CORS_HEADERS })
    }

    const { error } = await supabase
      .from('desktop_auth_pending')
      .upsert({ state, tokens, created_at: new Date().toISOString() })

    if (error) {
      console.error('Failed to store desktop auth tokens:', error)
      return NextResponse.json({ error: 'Failed to store tokens' }, { status: 500, headers: CORS_HEADERS })
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('Desktop exchange POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: CORS_HEADERS })
  }
}

// GET — desktop app polls for tokens
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state')
  if (!state) {
    return NextResponse.json({ error: 'Missing state' }, { status: 400, headers: CORS_HEADERS })
  }

  try {
    const { data, error } = await supabase
      .from('desktop_auth_pending')
      .select('tokens, created_at')
      .eq('state', state)
      .single()

    if (error || !data) {
      return NextResponse.json({ pending: true }, { headers: CORS_HEADERS })
    }

    // Check expiry (5 minutes)
    const age = Date.now() - new Date(data.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      await supabase.from('desktop_auth_pending').delete().eq('state', state)
      return NextResponse.json({ error: 'Token expired' }, { status: 410, headers: CORS_HEADERS })
    }

    // Delete after retrieval (one-time use)
    await supabase.from('desktop_auth_pending').delete().eq('state', state)

    return NextResponse.json({ tokens: data.tokens }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('Desktop exchange GET error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: CORS_HEADERS })
  }
}
