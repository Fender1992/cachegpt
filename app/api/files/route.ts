/**
 * Files API
 * GET: List all user's uploaded files
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError, getUserId } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = getUserId(authResult);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: files, error } = await supabase
      .from('conversation_files')
      .select('id, file_name, file_type, file_size, content_preview, created_at, conversation_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Files API] Error fetching files:', error);
      return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
    }

    return NextResponse.json({
      files: (files || []).map((f: any) => ({
        id: f.id,
        name: f.file_name,
        type: f.file_type,
        size: f.file_size,
        preview: f.content_preview,
        uploadedAt: f.created_at,
        conversationId: f.conversation_id,
      })),
    });
  } catch (error) {
    console.error('[Files API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}
