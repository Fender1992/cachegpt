/**
 * Slack Messages API
 * GET: Fetch messages from a channel
 * POST: Send a message to a channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidSlackToken } from '@/lib/slack/slack-token';

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
      .eq('provider', 'slack')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Slack not connected' }, { status: 404 });
    }

    const token = await getValidSlackToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const channelId = searchParams.get('channelId');
    const limit = searchParams.get('limit') || '25';
    const cursor = searchParams.get('cursor') || '';

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const params = new URLSearchParams({
      channel: channelId,
      limit,
    });
    if (cursor) params.set('cursor', cursor);

    const messagesRes = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!messagesRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: messagesRes.status });
    }

    const messagesData = await messagesRes.json();

    if (!messagesData.ok) {
      console.error('[Slack Messages] API error:', messagesData.error);
      return NextResponse.json({ error: messagesData.error }, { status: 400 });
    }

    // Collect unique user IDs to resolve names
    const userIds = new Set<string>();
    for (const msg of messagesData.messages || []) {
      if (msg.user) userIds.add(msg.user);
    }

    // Batch resolve user names
    const userMap = new Map<string, string>();
    if (userIds.size > 0) {
      for (const uid of userIds) {
        try {
          const userRes = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const userData = await userRes.json();
          if (userData.ok) {
            userMap.set(uid, userData.user?.real_name || userData.user?.name || uid);
          }
        } catch {
          // Skip failed user lookups
        }
      }
    }

    const messages = (messagesData.messages || []).map((msg: any) => ({
      ts: msg.ts,
      text: msg.text || '',
      userId: msg.user || '',
      userName: userMap.get(msg.user) || msg.user || 'Unknown',
      threadTs: msg.thread_ts,
      replyCount: msg.reply_count || 0,
      timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
    }));

    return NextResponse.json({
      messages,
      nextCursor: messagesData.response_metadata?.next_cursor || null,
      hasMore: messagesData.has_more || false,
    });
  } catch (error) {
    console.error('[Slack Messages] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Slack messages' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Slack not connected' }, { status: 404 });
    }

    const token = await getValidSlackToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const body = await req.json();
    const { channelId, text, threadTs } = body;

    if (!channelId || !text) {
      return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
    }

    const payload: any = {
      channel: channelId,
      text,
    };
    if (threadTs) payload.thread_ts = threadTs;

    const sendRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const sendData = await sendRes.json();

    if (!sendData.ok) {
      console.error('[Slack Send] API error:', sendData.error);
      return NextResponse.json({ error: sendData.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, ts: sendData.ts });
  } catch (error) {
    console.error('[Slack Send] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send Slack message' },
      { status: 500 }
    );
  }
}
