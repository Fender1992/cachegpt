/**
 * Google Drive Context Retriever
 * Fetches relevant Drive files on demand via Google Drive API
 * No pre-sync or embeddings — queries Drive live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidDriveToken } from '@/lib/google-drive/drive-token';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MAX_FILES = 5;
const MAX_CONTENT_PER_FILE = 2000;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to determine if it's Drive-related
 */
function analyzeDriveQuery(query: string): { isDriveQuery: boolean; searchTerms: string[] } {
  const lowerQuery = query.toLowerCase();

  const driveKeywords = [
    'drive', 'google drive', 'file', 'files', 'document', 'documents',
    'spreadsheet', 'spreadsheets', 'presentation', 'presentations',
    'folder', 'folders', 'shared', 'docs', 'sheets', 'slides',
    'my drive', 'uploaded', 'attachment',
  ];

  const isDriveQuery = driveKeywords.some(k => lowerQuery.includes(k));

  const stopWords = new Set([
    'drive', 'google', 'file', 'files', 'document', 'documents',
    'spreadsheet', 'presentation', 'folder', 'shared', 'docs', 'sheets', 'slides',
    'what', 'where', 'how', 'which', 'find', 'search', 'show', 'get', 'list',
    'the', 'a', 'an', 'in', 'on', 'at', 'for', 'my', 'me', 'is', 'are',
    'from', 'about', 'with', 'that', 'this', 'those', 'these',
  ]);

  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return { isDriveQuery, searchTerms };
}

/**
 * Main Drive context retrieval function
 */
export async function retrieveDriveContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeDriveQuery(queryText);

  if (!analysis.isDriveQuery) {
    return null;
  }

  try {
    const token = await getValidDriveToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    // Search Drive for relevant files
    let driveQuery = 'trashed = false';
    if (analysis.searchTerms.length > 0) {
      const searchStr = analysis.searchTerms.join(' ');
      driveQuery += ` and (name contains '${searchStr.replace(/'/g, "\\'")}' or fullText contains '${searchStr.replace(/'/g, "\\'")}')`;
    }

    const params = new URLSearchParams({
      q: driveQuery,
      pageSize: String(MAX_FILES),
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      orderBy: 'modifiedTime desc',
    });

    const res = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error('[Drive Context] Search failed:', res.status);
      return null;
    }

    const data = await res.json();
    const files = data.files || [];

    if (files.length === 0) {
      return null;
    }

    // Fetch content for text-exportable files
    const lines = ['## Google Drive Context\n'];

    for (const file of files.slice(0, MAX_FILES)) {
      let content = '';
      const mimeType: string = file.mimeType;

      if (mimeType === 'application/vnd.google-apps.document') {
        const exportRes = await fetch(
          `${DRIVE_API}/files/${file.id}/export?mimeType=text/plain`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
        );
        if (exportRes.ok) {
          content = await exportRes.text();
        }
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        const exportRes = await fetch(
          `${DRIVE_API}/files/${file.id}/export?mimeType=text/csv`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
        );
        if (exportRes.ok) {
          content = await exportRes.text();
        }
      } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        const downloadRes = await fetch(
          `${DRIVE_API}/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
        );
        if (downloadRes.ok) {
          content = await downloadRes.text();
        }
      }

      // Truncate content
      if (content.length > MAX_CONTENT_PER_FILE) {
        content = content.substring(0, MAX_CONTENT_PER_FILE) + '... [truncated]';
      }

      lines.push(`### ${file.name}`);
      lines.push(`Type: ${file.mimeType} | Modified: ${new Date(file.modifiedTime).toLocaleDateString()}`);
      if (content) {
        lines.push(`\`\`\`\n${content}\n\`\`\``);
      } else {
        lines.push(`(Binary file — content not available)`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[Drive Context] Error:', error);
    return null;
  }
}
