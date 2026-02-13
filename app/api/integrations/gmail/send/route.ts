/**
 * Gmail Send API
 * POST: Send an email
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidGmailToken } from '@/lib/gmail/gmail-token';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'gmail')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 404 });
    }

    const token = await getValidGmailToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const { to, subject, body, threadId, inReplyTo } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      );
    }

    // Compose RFC 2822 message
    const fromEmail = integration.provider_user_id;
    const messageParts = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
    ];

    if (inReplyTo) {
      messageParts.push(`In-Reply-To: ${inReplyTo}`);
      messageParts.push(`References: ${inReplyTo}`);
    }

    messageParts.push('', body);

    const rawMessage = base64UrlEncode(messageParts.join('\r\n'));

    // Send via Gmail API
    const sendBody: any = { raw: rawMessage };
    if (threadId) sendBody.threadId = threadId;

    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendBody),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Gmail Send] Failed:', res.status, errorText);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: res.status }
      );
    }

    const sent = await res.json();

    return NextResponse.json({
      id: sent.id,
      threadId: sent.threadId,
      labelIds: sent.labelIds,
    });
  } catch (error) {
    console.error('[Gmail Send] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
