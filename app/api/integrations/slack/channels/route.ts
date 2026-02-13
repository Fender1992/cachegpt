/**
 * Slack Channels API
 * GET: Fetch user's channel list
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
    const types = searchParams.get('types') || 'public_channel,private_channel';
    const limit = searchParams.get('limit') || '100';
    const cursor = searchParams.get('cursor') || '';

    const params = new URLSearchParams({
      types,
      limit,
      exclude_archived: 'true',
    });
    if (cursor) params.set('cursor', cursor);

    const channelsRes = await fetch(
      `https://slack.com/api/conversations.list?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!channelsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: channelsRes.status });
    }

    const channelsData = await channelsRes.json();

    if (!channelsData.ok) {
      console.error('[Slack Channels] API error:', channelsData.error);
      return NextResponse.json({ error: channelsData.error }, { status: 400 });
    }

    const channels = (channelsData.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private || false,
      isMember: ch.is_member || false,
      topic: ch.topic?.value || '',
      purpose: ch.purpose?.value || '',
      memberCount: ch.num_members || 0,
      unreadCount: ch.unread_count || 0,
    }));

    return NextResponse.json({
      channels,
      nextCursor: channelsData.response_metadata?.next_cursor || null,
    });
  } catch (error) {
    console.error('[Slack Channels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Slack channels' },
      { status: 500 }
    );
  }
}
