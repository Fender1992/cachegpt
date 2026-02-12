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
      .select('id, access_token')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const limit = req.nextUrl.searchParams.get('limit') || '50';
    const after = req.nextUrl.searchParams.get('after') || '';
    const params = new URLSearchParams({ limit });
    if (after) params.set('after', after);

    const url = `${DISCORD_API}/channels/${channelId}/messages?${params}`;

    // Try user's OAuth token first
    if (integration.access_token) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${integration.access_token}` },
      });

      if (response.ok) {
        const messages = await response.json();
        return NextResponse.json(messages);
      }

      console.error('[Discord Messages] OAuth token failed:', response.status);
    }

    // Fallback: try Bot token (works if bot is in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      const response = await fetch(url, {
        headers: { Authorization: `Bot ${botToken}` },
      });

      if (response.ok) {
        const messages = await response.json();
        return NextResponse.json(messages);
      }

      const text = await response.text();
      console.error('[Discord Messages] Bot token failed:', response.status, text);
    }

    return NextResponse.json({ error: 'Failed to fetch messages. The OAuth token may have expired — try reconnecting Discord.' }, { status: 403 });
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
      .select('id, access_token')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const url = `${DISCORD_API}/channels/${channelId}/messages`;
    const body = JSON.stringify({ content });

    // Try user's OAuth token first
    if (integration.access_token) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (response.ok) {
        const message = await response.json();
        return NextResponse.json(message);
      }

      console.error('[Discord Send] OAuth token failed:', response.status);
    }

    // Fallback: try Bot token
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (response.ok) {
        const message = await response.json();
        return NextResponse.json(message);
      }

      const text = await response.text();
      console.error('[Discord Send] Bot token failed:', response.status, text);
    }

    return NextResponse.json({ error: 'Failed to send message. Try reconnecting Discord.' }, { status: 403 });
  } catch (error) {
    console.error('[Discord Send Message] Error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
