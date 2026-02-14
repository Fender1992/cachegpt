/**
 * Teams Messages API
 * GET: Fetch messages from a channel or chat
 * POST: Send a message to a channel or chat
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidTeamsToken } from '@/lib/teams/teams-token';

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
      .eq('provider', 'teams')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Teams not connected' }, { status: 404 });
    }

    const token = await getValidTeamsToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');
    const channelId = searchParams.get('channelId');
    const chatId = searchParams.get('chatId');
    const top = searchParams.get('top') || '25';

    let messagesUrl: string;

    if (chatId) {
      // Fetch messages from a 1:1 or group chat
      messagesUrl = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages?$top=${top}`;
    } else if (teamId && channelId) {
      // Fetch messages from a team channel
      messagesUrl = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages?$top=${top}`;
    } else {
      return NextResponse.json({ error: 'teamId+channelId or chatId is required' }, { status: 400 });
    }

    const messagesRes = await fetch(messagesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!messagesRes.ok) {
      const errText = await messagesRes.text();
      console.error('[Teams Messages] API error:', messagesRes.status, errText);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: messagesRes.status });
    }

    const messagesData = await messagesRes.json();

    const messages = (messagesData.value || []).map((msg: any) => ({
      id: msg.id,
      text: msg.body?.content || '',
      contentType: msg.body?.contentType || 'text',
      userId: msg.from?.user?.id || '',
      userName: msg.from?.user?.displayName || 'Unknown',
      createdDateTime: msg.createdDateTime,
      replyCount: msg.replies?.length || 0,
    }));

    return NextResponse.json({
      messages,
      nextLink: messagesData['@odata.nextLink'] || null,
      hasMore: !!messagesData['@odata.nextLink'],
    });
  } catch (error) {
    console.error('[Teams Messages] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Teams messages' },
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
      .eq('provider', 'teams')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Teams not connected' }, { status: 404 });
    }

    const token = await getValidTeamsToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const body = await req.json();
    const { teamId, channelId, chatId, text } = body;

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    let sendUrl: string;

    if (chatId) {
      sendUrl = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`;
    } else if (teamId && channelId) {
      sendUrl = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`;
    } else {
      return NextResponse.json({ error: 'teamId+channelId or chatId is required' }, { status: 400 });
    }

    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: {
          content: text,
          contentType: 'text',
        },
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error('[Teams Send] API error:', sendRes.status, errText);
      return NextResponse.json({ error: 'Failed to send message' }, { status: sendRes.status });
    }

    const sendData = await sendRes.json();

    return NextResponse.json({ success: true, id: sendData.id });
  } catch (error) {
    console.error('[Teams Send] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send Teams message' },
      { status: 500 }
    );
  }
}
