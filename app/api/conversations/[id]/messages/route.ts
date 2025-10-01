import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

// GET /api/conversations/[id]/messages - Get messages for a specific conversation (ONLY if user owns it)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const conversationId = id

    // Create Supabase client with user session
    const cookieStore = cookies()
    const supabase = await createClient()

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

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

    // Get messages directly from the table - ONLY for this user's conversation
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, role, content, provider, model, tokens_used, created_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching messages for user:', userId, 'conversation:', conversationId, error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return NextResponse.json({
      messages,
      conversation_id: conversationId,
      user_id: userId, // Include for verification
      total: messages?.length || 0
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

    // Create Supabase client with user session
    const cookieStore = cookies()
    const supabase = await createClient()

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

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