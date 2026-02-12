/**
 * Discord Channels API
 * GET: Fetch channels for a guild from synced database metadata,
 *      falling back to Discord API with user's OAuth token (auto-refreshed)
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

    const guildId = req.nextUrl.searchParams.get('guildId');
    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
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

    // Try to serve from synced database metadata first
    const { data: channels, error: dbError } = await supabase
      .from('discord_channel_metadata')
      .select('channel_id, channel_name, channel_type, parent_id, topic, last_message_id')
      .eq('integration_id', integration.id)
      .eq('guild_id', guildId)
      .order('channel_name');

    if (!dbError && channels && channels.length > 0) {
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

    // Fallback: fetch from Discord API using user's OAuth token (auto-refreshed)
    const token = await getValidDiscordToken(integration.id, integration.access_token, integration.refresh_token, integration.token_expires_at);
    if (token) {
      const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const apiChannels = await response.json();

        // Cache channels in DB for next time
        const textChannels = apiChannels.filter((c: any) => [0, 5, 10, 11, 12].includes(c.type));
        if (textChannels.length > 0) {
          const channelMetadata = textChannels.map((c: any) => ({
            integration_id: integration.id,
            guild_id: guildId,
            channel_id: c.id,
            channel_name: c.name || 'unnamed',
            channel_type: c.type,
            parent_id: c.parent_id || null,
            topic: c.topic || null,
            last_message_id: c.last_message_id || null,
          }));
          await supabase
            .from('discord_channel_metadata')
            .upsert(channelMetadata, { onConflict: 'integration_id,channel_id' })
            .then(({ error }) => {
              if (error) console.error('[Discord Channels] Failed to cache channels:', error);
            });
        }

        return NextResponse.json(apiChannels);
      }

      const errorText = await response.text();
      console.error('[Discord Channels] OAuth API failed:', response.status, errorText);
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
    }

    return NextResponse.json({ error: 'Failed to load channels. Your Discord token may have expired — try disconnecting and reconnecting Discord in Settings.' }, { status: 403 });
  } catch (error) {
    console.error('[Discord Channels] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
