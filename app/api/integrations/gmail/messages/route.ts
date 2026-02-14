/**
 * Gmail Messages API
 * GET ?labelId=INBOX&limit=20&pageToken=... — List messages in a label
 * GET ?messageId=... — Get full message details
 * POST { messageId, action } — Mark as read or trash a message
 * DELETE ?messageId=... — Trash a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidGmailToken } from '@/lib/gmail/gmail-token';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function getHeader(headers: any[], name: string): string {
  const header = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload: any): string {
  // Direct body data
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — find text/plain or text/html
  if (payload.parts) {
    // Prefer text/plain
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }

    // Fall back to text/html
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      // Strip HTML tags for display
      return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const body = extractBody(part);
        if (body) return body;
      }
    }
  }

  return '';
}

async function getToken(userId: string): Promise<{ token: string; integration: any } | null> {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('status', 'active')
    .single();

  if (!integration) return null;

  const token = await getValidGmailToken(
    integration.id,
    integration.access_token,
    integration.refresh_token,
    integration.token_expires_at
  );

  if (!token) return null;
  return { token, integration };
}

/**
 * POST — Mark a message as read (remove UNREAD label)
 * Body: { messageId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const auth = await getToken(authResult.user.id);
    if (!auth) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 404 });
    }

    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    const res = await fetch(
      `${GMAIL_API}/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      console.error('[Gmail Messages] Mark as read failed:', res.status, error);
      return NextResponse.json({ error: 'Failed to mark as read' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Gmail Messages] Mark as read error:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}

/**
 * DELETE — Trash one or more messages
 * Query: ?messageId=id1 (single) or ?messageIds=id1,id2,id3 (batch)
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const auth = await getToken(authResult.user.id);
    if (!auth) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 404 });
    }

    // Support both single and batch
    const singleId = req.nextUrl.searchParams.get('messageId');
    const batchIds = req.nextUrl.searchParams.get('messageIds');
    const ids = batchIds ? batchIds.split(',').filter(Boolean) : singleId ? [singleId] : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'messageId or messageIds is required' }, { status: 400 });
    }

    // Trash all messages in parallel
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`${GMAIL_API}/messages/${id}/trash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}` },
        })
      )
    );

    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
    if (failed.length > 0) {
      console.error(`[Gmail Messages] Trash failed for ${failed.length}/${ids.length} messages`);
    }

    const succeeded = ids.length - failed.length;
    return NextResponse.json({ success: true, deleted: succeeded, failed: failed.length });
  } catch (error) {
    console.error('[Gmail Messages] Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const auth = await getToken(authResult.user.id);
    if (!auth) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 404 });
    }

    const { searchParams } = req.nextUrl;
    const messageId = searchParams.get('messageId');

    // Single message detail
    if (messageId) {
      const res = await fetch(
        `${GMAIL_API}/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );

      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch message' }, { status: res.status });
      }

      const msg = await res.json();
      const headers = msg.payload?.headers || [];

      return NextResponse.json({
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds || [],
        snippet: msg.snippet,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        messageId: getHeader(headers, 'Message-ID'),
        inReplyTo: getHeader(headers, 'In-Reply-To'),
        body: extractBody(msg.payload),
      });
    }

    // List messages in label
    const labelId = searchParams.get('labelId') || 'INBOX';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const pageToken = searchParams.get('pageToken');

    const params = new URLSearchParams({
      labelIds: labelId,
      maxResults: limit.toString(),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const listRes = await fetch(
      `${GMAIL_API}/messages?${params}`,
      { headers: { Authorization: `Bearer ${auth.token}` } }
    );

    if (!listRes.ok) {
      return NextResponse.json({ error: 'Failed to list messages' }, { status: listRes.status });
    }

    const listData = await listRes.json();
    const messageIds = listData.messages || [];

    // Fetch metadata for each message
    const messages = await Promise.all(
      messageIds.map(async (m: any) => {
        try {
          const res = await fetch(
            `${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${auth.token}` } }
          );
          if (!res.ok) return null;
          const msg = await res.json();
          const headers = msg.payload?.headers || [];
          return {
            id: msg.id,
            threadId: msg.threadId,
            labelIds: msg.labelIds || [],
            snippet: msg.snippet,
            from: getHeader(headers, 'From'),
            subject: getHeader(headers, 'Subject'),
            date: getHeader(headers, 'Date'),
            isUnread: (msg.labelIds || []).includes('UNREAD'),
          };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({
      messages: messages.filter(Boolean),
      nextPageToken: listData.nextPageToken || null,
      resultSizeEstimate: listData.resultSizeEstimate || 0,
    });
  } catch (error) {
    console.error('[Gmail Messages] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
