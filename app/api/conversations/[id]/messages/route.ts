import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  resolveAuthentication,
  isAuthError,
  getUserId
} from '@/lib/unified-auth-resolver'

// GET /api/conversations/[id]/messages - Get messages for a specific conversation (ONLY if user owns it)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const conversationId = id

    // Use unified authentication resolver (supports both cookies and Bearer tokens)
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

    // First verify the conversation belongs to this user
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId) // CRITICAL: Only allow access to user's own conversations
      .single()

    if (convError || !conversation) {
      return NextResponse.json({
        error: 'Conversation not found or access denied'
      }, { status: 404 })
    }

    // Get query parameters for pagination
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const before = url.searchParams.get('before') // Timestamp for pagination

    // Build query
    let query = supabase
      .from('messages')
      .select('id, role, content, provider, model, tokens_used, created_at, response_time_ms')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    // If 'before' parameter is provided, get messages before that timestamp
    if (before) {
      query = query.lt('created_at', before)
    }

    // Limit results
    query = query.limit(limit)

    const { data: messages, error } = await query

    if (error) {
      console.error('Error fetching messages for user:', userId, 'conversation:', conversationId, error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Check if there are more messages (for pagination)
    const { count: totalCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)

    const hasMore = (messages?.length || 0) < (totalCount || 0)

    return NextResponse.json({
      messages,
      conversation_id: conversationId,
      user_id: userId, // Include for verification
      total: messages?.length || 0,
      hasMore,
      totalCount: totalCount || 0
    })
  } catch (error) {
    console.error('Error in messages API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/conversations/[id]/messages - Add message to conversation (ONLY if user owns it)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const conversationId = id
    const { role, content, provider, model, tokens_used, response_time_ms, cost, platform = 'web' } = await request.json()

    // Use unified authentication resolver (supports both cookies and Bearer tokens)
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

    // First verify the conversation belongs to this user
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId) // CRITICAL: Only allow access to user's own conversations
      .single()

    if (convError || !conversation) {
      return NextResponse.json({
        error: 'Conversation not found or access denied'
      }, { status: 404 })
    }

    // Create new message - ONLY for this authenticated user's conversation
    const { data: message, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        user_id: userId,
        role,
        content,
        provider,
        model,
        tokens_used: tokens_used || 0,
        response_time_ms: response_time_ms || null,
        cost: cost || 0,
        platform
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating message for user:', userId, 'conversation:', conversationId, error)
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
    }

    return NextResponse.json({
      message,
      conversation_id: conversationId,
      user_id: userId // Include for verification
    })
  } catch (error) {
    console.error('Error in messages POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}