import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { PDFParse } from 'pdf-parse'

const MAX_FILE_SIZE = 30 * 1024 * 1024 // 30MB
const MAX_FILES_PER_CONVERSATION = 5

const ALLOWED_TYPES = {
  // Documents
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  // Images
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  // Code
  'text/javascript': '.js',
  'application/javascript': '.js',
  'text/typescript': '.ts',
  'text/x-python': '.py',
  'application/x-python': '.py',
}

/**
 * POST /api/upload - Upload and parse document
 * Handles file uploads for chat conversations
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const formData = await request.formData()
    const file = formData.get('file') as File
    const conversationId = formData.get('conversationId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File size exceeds 30MB limit. File size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
      }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES]) {
      return NextResponse.json({
        error: `File type not supported: ${file.type}. Supported types: PDF, TXT, MD, CSV, JSON, images, code files`
      }, { status: 400 })
    }

    // Check file count limit for conversation
    if (conversationId) {
      const { count, error: countError } = await supabase
        .from('conversation_files')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)

      if (countError) {
        console.error('[UPLOAD] Error checking file count:', countError)
      } else if (count !== null && count >= MAX_FILES_PER_CONVERSATION) {
        return NextResponse.json({
          error: `Maximum ${MAX_FILES_PER_CONVERSATION} files per conversation. Please delete some files first.`
        }, { status: 400 })
      }
    }

    // Read file content
    const buffer = await file.arrayBuffer()
    const content = await parseFileContent(file, buffer)

    // Get file extension
    const fileExtension = ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES]

    // Store file in database
    const { data: fileRecord, error: insertError } = await supabase
      .from('conversation_files')
      .insert({
        conversation_id: conversationId || null,
        user_id: userId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        file_extension: fileExtension,
        content_text: content.text,
        content_preview: content.preview,
        upload_source: 'web'
      })
      .select()
      .single()

    if (insertError) {
      console.error('[UPLOAD] Database error:', insertError)
      return NextResponse.json({
        error: 'Failed to store file',
        details: insertError.message
      }, { status: 500 })
    }

    console.log('[UPLOAD] File uploaded and stored:', {
      id: fileRecord.id,
      name: file.name,
      type: file.type,
      size: `${(file.size / 1024).toFixed(2)}KB`,
      contentLength: content.text.length
    })

    return NextResponse.json({
      success: true,
      file: {
        id: fileRecord.id,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: content.preview,
        uploadedAt: fileRecord.created_at
      },
      // Return full content for immediate use in chat
      content: content.text
    })

  } catch (error) {
    console.error('[UPLOAD] Error:', error)
    return NextResponse.json({
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Parse file content based on type
 */
async function parseFileContent(
  file: File,
  buffer: ArrayBuffer
): Promise<{ text: string; preview: string }> {
  const decoder = new TextDecoder('utf-8')

  switch (file.type) {
    case 'text/plain':
    case 'text/markdown':
    case 'text/csv':
    case 'application/json':
    case 'text/javascript':
    case 'application/javascript':
    case 'text/typescript':
    case 'text/x-python':
    case 'application/x-python': {
      const text = decoder.decode(buffer)
      const preview = text.substring(0, 200) + (text.length > 200 ? '...' : '')
      return { text, preview }
    }

    case 'application/pdf': {
      try {
        // Create PDF parser with buffer data
        const parser = new PDFParse({ data: Buffer.from(buffer) })
        const result = await parser.getText()
        const text = result.text
        const preview = text.substring(0, 200) + (text.length > 200 ? '...' : '')

        console.log('[PDF-PARSE] Success:', {
          file: file.name,
          pages: result.total,
          textLength: text.length
        })

        return { text, preview }
      } catch (error) {
        console.error('[PDF-PARSE] Error:', error)
        return {
          text: `[PDF Document: ${file.name}]\nError parsing PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
          preview: `PDF: ${file.name} (parse error)`
        }
      }
    }

    case 'image/jpeg':
    case 'image/png':
    case 'image/gif':
    case 'image/webp': {
      // For images, we'll encode as base64 for vision models
      const base64 = Buffer.from(buffer).toString('base64')
      return {
        text: `[Image: ${file.name}]\nData: data:${file.type};base64,${base64.substring(0, 100)}...`,
        preview: `Image: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`
      }
    }

    default:
      return {
        text: `[Unsupported file type: ${file.type}]`,
        preview: `${file.name} (${file.type})`
      }
  }
}
