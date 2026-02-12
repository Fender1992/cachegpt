/**
 * Discord Messages API
 * GET: Fetch messages from a channel via Discord API
 * POST: Send a message to a channel via Discord API
 * Uses user's OAuth token (auto-refreshed) with Bot token fallback
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidDiscordToken } from '@/lib/discord/discord-token';

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

    // Get user's Discord integration with token info
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
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

    // Try user's OAuth token first (auto-refreshed)
    const token = await getValidDiscordToken(integration.id, integration.access_token, integration.refresh_token, integration.token_expires_at);
    if (token) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
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

    return NextResponse.json({ error: 'Failed to fetch messages. Try disconnecting and reconnecting Discord in Settings.' }, { status: 403 });
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

    // Get user's Discord integration with token info
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const url = `${DISCORD_API}/channels/${channelId}/messages`;
    const body = JSON.stringify({ content });

    // Try user's OAuth token first (auto-refreshed)
    const token = await getValidDiscordToken(integration.id, integration.access_token, integration.refresh_token, integration.token_expires_at);
    if (token) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
