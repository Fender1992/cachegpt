/**
 * Discord Channels API
 * GET: Fetch channels for a guild from synced database metadata,
 *      falling back to Discord API with user's OAuth token
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

    const guildId = req.nextUrl.searchParams.get('guildId');
    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
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

    // Try to serve from synced database metadata first
    const { data: channels, error: dbError } = await supabase
      .from('discord_channel_metadata')
      .select('channel_id, channel_name, channel_type, parent_id, topic, last_message_id')
      .eq('integration_id', integration.id)
      .eq('guild_id', guildId)
      .order('channel_name');

    if (!dbError && channels && channels.length > 0) {
      // Map to Discord-compatible format
      const result = channels.map(c => ({
        id: c.channel_id,
        name: c.channel_name,
        type: c.channel_type,
        parent_id: c.parent_id,
        topic: c.topic,
        last_message_id: c.last_message_id,
        guild_id: guildId,
      }));
      return NextResponse.json(result);
    }

    // Fallback: fetch from Discord API using user's OAuth token
    if (integration.access_token) {
      const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bearer ${integration.access_token}` },
      });

      if (response.ok) {
        const apiChannels = await response.json();
        return NextResponse.json(apiChannels);
      }

      console.error('[Discord Channels] OAuth API fallback failed:', response.status);
    }

    // Final fallback: try Bot token (works if bot is in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${botToken}` },
      });

      if (response.ok) {
        const apiChannels = await response.json();
        return NextResponse.json(apiChannels);
      }

      console.error('[Discord Channels] Bot token fallback failed:', response.status);
    }

    return NextResponse.json({ error: 'No channels found. Try syncing your Discord integration first.' }, { status: 404 });
  } catch (error) {
    console.error('[Discord Channels] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
