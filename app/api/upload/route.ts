import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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
      // TODO: Query database for existing files in this conversation
      // For now, we'll rely on client-side enforcement
    }

    // Read file content
    const buffer = await file.arrayBuffer()
    const content = await parseFileContent(file, buffer)

    // Generate unique file ID
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Store file metadata (in-memory for now, can be moved to database)
    const fileMetadata = {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      content: content.text,
      preview: content.preview,
      uploadedAt: new Date().toISOString(),
      userId,
      conversationId
    }

    console.log('[UPLOAD] File uploaded:', {
      name: file.name,
      type: file.type,
      size: `${(file.size / 1024).toFixed(2)}KB`,
      contentLength: content.text.length
    })

    return NextResponse.json({
      success: true,
      file: {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: content.preview,
        uploadedAt: fileMetadata.uploadedAt
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
      // For PDF, we'll need a library like pdf-parse
      // For now, return placeholder
      return {
        text: `[PDF Document: ${file.name}]\nPDF parsing will be implemented with pdf-parse library.`,
        preview: `PDF: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`
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
