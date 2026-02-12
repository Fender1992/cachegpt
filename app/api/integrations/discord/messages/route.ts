/**
 * Discord Messages API
 * GET: Fetch messages from a channel via Discord API using Bot token
 * POST: Send a message via Discord API using Bot token
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';

const DISCORD_API = 'https://discord.com/api/v10';

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

    const channelId = req.nextUrl.searchParams.get('channelId');
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    // Verify user has a Discord integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    const limit = req.nextUrl.searchParams.get('limit') || '50';
    const after = req.nextUrl.searchParams.get('after') || '';
    const params = new URLSearchParams({ limit });
    if (after) params.set('after', after);

    const response = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages?${params}`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('[Discord Messages] API error:', response.status, text);
      return NextResponse.json({ error: text }, { status: response.status });
    }

    const messages = await response.json();
    return NextResponse.json(messages);
  } catch (error) {
    console.error('[Discord Messages] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { channelId, content } = await req.json();
    if (!channelId || !content) {
      return NextResponse.json({ error: 'channelId and content are required' }, { status: 400 });
    }

    // Verify user has a Discord integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Discord Send] API error:', response.status, text);
      return NextResponse.json({ error: text }, { status: response.status });
    }

    const message = await response.json();
    return NextResponse.json(message);
  } catch (error) {
    console.error('[Discord Send Message] Error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
