/**
 * Gmail Labels API
 * GET: List all Gmail labels with message counts
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidGmailToken } from '@/lib/gmail/gmail-token';

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

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch labels' }, { status: res.status });
    }

    const data = await res.json();

    // Fetch details for each label to get message counts
    const labels = await Promise.all(
      (data.labels || []).map(async (label: any) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/labels/${label.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            return {
              id: detail.id,
              name: detail.name,
              type: detail.type,
              messagesTotal: detail.messagesTotal || 0,
              messagesUnread: detail.messagesUnread || 0,
            };
          }
        } catch {
          // Fall through to basic info
        }
        return {
          id: label.id,
          name: label.name,
          type: label.type,
          messagesTotal: 0,
          messagesUnread: 0,
        };
      })
    );

    return NextResponse.json(labels);
  } catch (error) {
    console.error('[Gmail Labels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch labels' },
      { status: 500 }
    );
  }
}
