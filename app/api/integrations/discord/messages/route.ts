/**
 * Discord Messages API
 * GET: Fetch messages from a channel via bot proxy (primary),
 *      falling back to direct Discord API with user's OAuth token
 * POST: Send a message to a channel via bot proxy or direct API
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { botProxy } from '@/lib/discord/bot-proxy';
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

    // Get user's Discord integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const before = req.nextUrl.searchParams.get('before') || undefined;
    const after = req.nextUrl.searchParams.get('after') || undefined;

    // Priority 1: Try bot proxy
    try {
      const botAvailable = await botProxy.isAvailable();
      if (botAvailable) {
        const messages = await botProxy.getMessages(channelId, { limit, before, after });
        return NextResponse.json(messages);
      }
    } catch (err) {
      // Bot proxy unavailable — fall through to next strategy
    }

    // Priority 2: Direct Discord API with user's OAuth token (auto-refreshed)
    const token = await getValidDiscordToken(integration.id, integration.access_token, integration.refresh_token, integration.token_expires_at);
    if (token) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      if (after) params.set('after', after);

      const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const messages = await response.json();
        return NextResponse.json(messages);
      }
    }

    // Priority 3: Bot token direct (legacy fallback)
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      if (after) params.set('after', after);

      const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages?${params}`, {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (response.ok) {
        const messages = await response.json();
        return NextResponse.json(messages);
      }
    }

    return NextResponse.json({ error: 'Failed to fetch messages. The bot may not have access to this channel.' }, { status: 403 });
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

    // Get user's Discord integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    // Priority 1: Try bot proxy
    try {
      const botAvailable = await botProxy.isAvailable();
      if (botAvailable) {
        const message = await botProxy.sendMessage(channelId, content);
        return NextResponse.json(message);
      }
    } catch (err) {
      // Bot proxy unavailable — fall through to next strategy
    }

    // Priority 2: Direct Discord API with user's OAuth token
    const token = await getValidDiscordToken(integration.id, integration.access_token, integration.refresh_token, integration.token_expires_at);
    if (token) {
      const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (response.ok) {
        const message = await response.json();
        return NextResponse.json(message);
      }
    }

    return NextResponse.json({ error: 'Failed to send message.' }, { status: 403 });
  } catch (error) {
    console.error('[Discord Send Message] Error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
