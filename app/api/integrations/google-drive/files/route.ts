/**
 * Google Drive Files API
 * GET: List/search files + get file content
 * DELETE: Trash a file
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidDriveToken } from '@/lib/google-drive/drive-token';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MAX_CONTENT_SIZE = 50 * 1024; // 50KB

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'google_drive')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 404 });
    }

    const token = await getValidDriveToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const fileId = searchParams.get('fileId');
    const query = searchParams.get('q');
    const pageToken = searchParams.get('pageToken');

    // If fileId is provided, get file content
    if (fileId) {
      return await getFileContent(token, fileId);
    }

    // Otherwise, list/search files
    return await listFiles(token, query, pageToken);
  } catch (error) {
    console.error('[Drive Files] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Drive files' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'google_drive')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 404 });
    }

    const token = await getValidDriveToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const fileId = req.nextUrl.searchParams.get('fileId');
    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    // Move file to trash (not permanent delete)
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.error('[Drive Files] Delete failed:', res.status, errorText);
      return NextResponse.json({ error: 'Failed to delete file' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Drive Files] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}

async function listFiles(token: string, query: string | null, pageToken: string | null) {
  const params = new URLSearchParams({
    pageSize: '20',
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,owners)',
    orderBy: 'modifiedTime desc',
  });

  // Build query
  let driveQuery = "trashed = false";
  if (query) {
    driveQuery += ` and (name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}')`;
  }
  params.set('q', driveQuery);

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.error('[Drive Files] List failed:', res.status);
    return NextResponse.json({ error: 'Failed to list files' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({
    files: (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      size: f.size ? parseInt(f.size) : null,
      iconLink: f.iconLink,
      webViewLink: f.webViewLink,
      owner: f.owners?.[0]?.displayName || '',
    })),
    nextPageToken: data.nextPageToken || null,
  });
}

async function getFileContent(token: string, fileId: string) {
  // First get file metadata
  const metaRes = await fetch(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,webViewLink`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!metaRes.ok) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const meta = await metaRes.json();
  const mimeType: string = meta.mimeType;

  let content = '';
  let exportedAs = '';

  // Google Workspace files — export as text
  if (mimeType === 'application/vnd.google-apps.document') {
    const exportRes = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (exportRes.ok) {
      content = await exportRes.text();
      exportedAs = 'text/plain';
    }
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportRes = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/csv`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (exportRes.ok) {
      content = await exportRes.text();
      exportedAs = 'text/csv';
    }
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    const exportRes = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (exportRes.ok) {
      content = await exportRes.text();
      exportedAs = 'text/plain';
    }
  } else if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/xml'
  ) {
    // Regular text files — download directly
    const downloadRes = await fetch(
      `${DRIVE_API}/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (downloadRes.ok) {
      content = await downloadRes.text();
      exportedAs = mimeType;
    }
  } else {
    // Binary files (PDF, images, etc.) — metadata only
    content = '';
    exportedAs = 'metadata_only';
  }

  // Truncate content
  if (content.length > MAX_CONTENT_SIZE) {
    content = content.substring(0, MAX_CONTENT_SIZE) + '\n\n[Content truncated at 50KB]';
  }

  return NextResponse.json({
    file: {
      id: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      size: meta.size ? parseInt(meta.size) : null,
      webViewLink: meta.webViewLink,
    },
    content,
    exportedAs,
  });
}
