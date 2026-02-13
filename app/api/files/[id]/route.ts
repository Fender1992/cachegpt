/**
 * Single File API
 * GET: Get file detail
 * DELETE: Delete file (storage + DB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError, getUserId } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = getUserId(authResult);
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: file, error } = await supabase
      .from('conversation_files')
      .select('id, file_name, file_type, file_size, content_text, content_preview, created_at, conversation_id, storage_path')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({
      file: {
        id: file.id,
        name: file.file_name,
        type: file.file_type,
        size: file.file_size,
        content: file.content_text,
        preview: file.content_preview,
        uploadedAt: file.created_at,
        conversationId: file.conversation_id,
      },
    });
  } catch (error) {
    console.error('[File Detail] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = getUserId(authResult);
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get file to find storage path
    const { data: file, error: fetchError } = await supabase
      .from('conversation_files')
      .select('id, storage_path')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Delete from storage
    if (file.storage_path) {
      await supabase.storage
        .from('conversation-files')
        .remove([file.storage_path]);
    }

    // Delete from database
    await supabase
      .from('conversation_files')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    return NextResponse.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('[File Delete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
