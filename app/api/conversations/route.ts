import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { error as logError } from '@/lib/logger'
import {
  resolveAuthentication,
  isAuthError,
  getUserId
} from '@/lib/unified-auth-resolver'

// GET /api/conversations - Get ONLY the authenticated user's conversation list
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const platform = searchParams.get('platform') || null
    const userIdParam = searchParams.get('user_id') // Allow passing user_id directly

    let userId: string

    // If user_id is provided directly, use it (trusted from frontend with valid session)
    if (userIdParam) {
      userId = userIdParam
      console.log('[CONVERSATIONS API] Using provided user_id:', userId)
    } else {
      // Fall back to auth resolver
      const authResult = await resolveAuthentication(request)

      if (isAuthError(authResult)) {
        console.error('[CONVERSATIONS API] Auth failed:', authResult.error)
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
      }

      userId = getUserId(authResult)
      console.log('[CONVERSATIONS API] User authenticated via resolver:', userId)
    }

    // Create Supabase client with service key for database operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

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
    console.error('[CONVERSATIONS API] Exception:', error)
    logError('Error in conversations API', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST /api/conversations - Create new conversation for ONLY the authenticated user
export async function POST(request: NextRequest) {
  try {
    const { title, provider, model, platform = 'web' } = await request.json()

    // Use unified authentication resolver
    const authResult = await resolveAuthentication(request)

    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const userId = getUserId(authResult)

    // Create Supabase client with service key for database operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

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