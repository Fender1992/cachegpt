/**
 * Yahoo Mail Messages API
 * GET ?labelId=INBOX&limit=20&page=... — List messages in a mailbox
 * GET ?messageId=... — Get full message details (messageId is UID)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidYahooToken } from '@/lib/yahoo/yahoo-token';
import { ImapFlow } from 'imapflow';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatAddress(addr: any): string {
  if (!addr || !addr.length) return '';
  return addr
    .map((a: any) => {
      if (a.name) return `${a.name} <${a.address}>`;
      return a.address || '';
    })
    .join(', ');
}

async function getToken(userId: string): Promise<{ token: string; email: string } | null> {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'yahoo')
    .eq('status', 'active')
    .single();

  if (!integration) return null;

  const token = await getValidYahooToken(
    integration.id,
    integration.access_token,
    integration.refresh_token,
    integration.token_expires_at
  );

  if (!token) return null;
  return { token, email: integration.provider_user_id };
}

async function createImapClient(email: string, token: string): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
    auth: { user: email, accessToken: token },
    logger: false,
  });
  await client.connect();
  return client;
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const auth = await getToken(authResult.user.id);
    if (!auth) {
      return NextResponse.json({ error: 'Yahoo not connected' }, { status: 404 });
    }

    const { searchParams } = req.nextUrl;
    const messageId = searchParams.get('messageId');

    const client = await createImapClient(auth.email, auth.token);

    try {
      // Single message detail (messageId is UID)
      if (messageId) {
        const labelId = searchParams.get('labelId') || 'INBOX';
        await client.mailboxOpen(labelId);

        const uid = parseInt(messageId, 10);
        const msg = await client.fetchOne(String(uid), {
          envelope: true,
          source: true,
          flags: true,
          uid: true,
        }, { uid: true });

        if (!msg) {
          await client.logout();
          return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Parse body from source
        let body = '';
        if (msg.source) {
          const sourceStr = msg.source.toString();
          // Try to extract text/plain body
          const textMatch = sourceStr.match(/Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:.*?\r?\n)*?\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\.\r?\n|$)/i);
          if (textMatch) {
            body = textMatch[1].trim();
          } else {
            // Try text/html
            const htmlMatch = sourceStr.match(/Content-Type:\s*text\/html[^\r\n]*\r?\n(?:.*?\r?\n)*?\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\.\r?\n|$)/i);
            if (htmlMatch) {
              body = extractTextFromHtml(htmlMatch[1]);
            } else {
              // Fallback: everything after first blank line
              const blankLine = sourceStr.indexOf('\r\n\r\n');
              if (blankLine !== -1) {
                body = sourceStr.substring(blankLine + 4).trim();
              }
            }
          }
          // Handle base64 encoding
          if (body && /^[A-Za-z0-9+/=\s]+$/.test(body.trim())) {
            try {
              const decoded = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
              if (decoded && !decoded.includes('\ufffd')) {
                body = decoded;
              }
            } catch {
              // Not base64, keep as-is
            }
          }
        }

        const envelope = msg.envelope;
        await client.logout();

        return NextResponse.json({
          id: String(msg.uid),
          threadId: String(msg.uid),
          labelIds: [],
          snippet: body.substring(0, 200),
          from: formatAddress(envelope?.from),
          to: formatAddress(envelope?.to),
          subject: envelope?.subject || '',
          date: envelope?.date?.toISOString() || '',
          messageId: envelope?.messageId || '',
          inReplyTo: envelope?.inReplyTo || '',
          body,
        });
      }

      // List messages in a mailbox
      const labelId = searchParams.get('labelId') || 'INBOX';
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
      const page = parseInt(searchParams.get('pageToken') || '0');

      const lock = await client.mailboxOpen(labelId);
      const totalMessages = lock.exists || 0;

      if (totalMessages === 0) {
        await client.logout();
        return NextResponse.json({
          messages: [],
          nextPageToken: null,
          resultSizeEstimate: 0,
        });
      }

      // Calculate sequence range (newest first)
      const offset = page * limit;
      const end = Math.max(totalMessages - offset, 1);
      const start = Math.max(end - limit + 1, 1);

      const messages: any[] = [];

      for await (const msg of client.fetch(`${start}:${end}`, {
        envelope: true,
        flags: true,
        uid: true,
      })) {
        const envelope = msg.envelope;
        messages.push({
          id: String(msg.uid),
          threadId: String(msg.uid),
          labelIds: [],
          snippet: '',
          from: formatAddress(envelope?.from),
          subject: envelope?.subject || '',
          date: envelope?.date?.toISOString() || '',
          isUnread: !msg.flags?.has('\\Seen'),
        });
      }

      // Sort newest first
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const hasMore = start > 1;

      await client.logout();

      return NextResponse.json({
        messages,
        nextPageToken: hasMore ? String(page + 1) : null,
        resultSizeEstimate: totalMessages,
      });
    } catch (innerError) {
      await client.logout().catch(() => {});
      throw innerError;
    }
  } catch (error) {
    console.error('[Yahoo Messages] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
