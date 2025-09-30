import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { error as logError } from '@/lib/logger'

// GET /api/conversations - Get ONLY the authenticated user's conversation list
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const platform = searchParams.get('platform') || null

    // Create Supabase client with user session
    const cookieStore = cookies()
    console.log('[CONVERSATIONS API] Cookies available:', cookieStore.getAll().map(c => c.name))
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    console.log('[CONVERSATIONS API] Session check:', {
      hasSession: !!session,
      userId: session?.user?.id,
      error: sessionError?.message
    })

    if (sessionError || !session?.user) {
      console.error('[CONVERSATIONS API] Auth failed:', sessionError?.message || 'No session')
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

    // Get conversations using the database function - ONLY for this user
    const { data: conversations, error } = await supabase
      .rpc('get_user_conversations', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_platform: platform
      })

    if (error) {
      logError('Error fetching conversations for user', error, { userId })
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    return NextResponse.json({
      conversations,
      user_id: userId, // Include for debugging
      total: conversations?.length || 0
    })
  } catch (error) {
    logError('Error in conversations API', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/conversations - Create new conversation for ONLY the authenticated user
export async function POST(request: NextRequest) {
  try {
    const { title, provider, model, platform = 'web' } = await request.json()

    // Create Supabase client with user session
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

    // Create new conversation - ONLY for this authenticated user
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert([{
        user_id: userId,
        title,
        provider,
        model,
        platform
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating conversation for user:', userId, error)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    return NextResponse.json({
      conversation,
      user_id: userId // Include for verification
    })
  } catch (error) {
    console.error('Error in conversations POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}