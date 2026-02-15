import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  resolveAuthentication,
  isAuthError,
  getUserId
} from '@/lib/unified-auth-resolver'

/**
 * GET /api/conversations/[id]/files - Get all files for a conversation
 * Returns file metadata for restoring file context when reopening conversations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params

    // Authenticate user
    const authResult = await resolveAuthentication(request)

    if (isAuthError(authResult)) {
      console.error('[CONVERSATION-FILES] Auth failed:', authResult.error)
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const userId = getUserId(authResult)

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Verify user owns this conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (convError || !conversation) {
      console.error('[CONVERSATION-FILES] Conversation not found or unauthorized:', convError)
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Fetch all files for this conversation
    const { data: files, error: filesError } = await supabase
      .from('conversation_files')
      .select('id, file_name, file_type, file_size, file_extension, content_text, content_preview, storage_path, created_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (filesError) {
      console.error('[CONVERSATION-FILES] Error fetching files:', filesError)
      return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
    }

    // Transform files to match UploadedFile interface
    const transformedFiles = (files || []).map(file => ({
      id: file.id,
      name: file.file_name,
      type: file.file_type,
      size: file.file_size,
      preview: file.content_preview || '',
      content: file.content_text || '',
      uploadedAt: file.created_at
    }))

    return NextResponse.json({
      success: true,
      files: transformedFiles
    })

  } catch (error) {
    console.error('[CONVERSATION-FILES] Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch conversation files',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
