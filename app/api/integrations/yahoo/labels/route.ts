/**
 * Yahoo Mail Labels/Folders API
 * GET: List all IMAP mailboxes with message counts
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

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'yahoo')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Yahoo not connected' }, { status: 404 });
    }

    const token = await getValidYahooToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const email = integration.provider_user_id;

    const client = new ImapFlow({
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
      auth: { user: email, accessToken: token },
      logger: false,
    });

    await client.connect();

    const mailboxes = await client.list();

    // Get status (messages, unseen) for each mailbox
    const labels = await Promise.all(
      mailboxes.map(async (mb) => {
        try {
          const status = await client.status(mb.path, {
            messages: true,
            unseen: true,
          });
          return {
            id: mb.path,
            name: mb.name,
            type: mb.specialUse || 'user',
            messagesTotal: status.messages || 0,
            messagesUnread: status.unseen || 0,
          };
        } catch {
          return {
            id: mb.path,
            name: mb.name,
            type: mb.specialUse || 'user',
            messagesTotal: 0,
            messagesUnread: 0,
          };
        }
      })
    );

    await client.logout();

    return NextResponse.json(labels);
  } catch (error) {
    console.error('[Yahoo Labels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch labels' },
      { status: 500 }
    );
  }
}
