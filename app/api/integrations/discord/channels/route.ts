/**
 * Discord Channels API
 * GET: Fetch channels for a guild via bot proxy (primary),
 *      falling back to database metadata or direct Discord API
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

    const guildId = req.nextUrl.searchParams.get('guildId');
    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
    }

    // Get user's Discord integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at, provider_user_id')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    // Priority 1: Try bot proxy (permission-filtered by user's Discord ID)
    try {
      const botAvailable = await botProxy.isAvailable();
      if (botAvailable) {
        const channels = await botProxy.getGuildChannels(guildId, integration.provider_user_id || undefined);
        if (channels && channels.length > 0) {
          // Map to consistent format
          const result = channels.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parent_id: c.parentId,
            topic: c.topic,
            position: c.position,
            guild_id: guildId,
          }));
          return NextResponse.json(result);
        }
      }
    } catch (err) {
      // Bot proxy unavailable or guild not in bot — fall through to next strategy
    }

    // Priority 2: Serve from synced database metadata
    const { data: dbChannels, error: dbError } = await supabase
      .from('discord_channel_metadata')
      .select('channel_id, channel_name, channel_type, parent_id, topic, last_message_id')
      .eq('integration_id', integration.id)
      .eq('guild_id', guildId)
      .order('channel_name');

    if (!dbError && dbChannels && dbChannels.length > 0) {
      const result = dbChannels.map(c => ({
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

    // Priority 3: Direct Discord API with user's OAuth token (auto-refreshed)
    const token = await getValidDiscordToken(integration.id, integration.access_token, integration.refresh_token, integration.token_expires_at);
    if (token) {
      const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const apiChannels = await response.json();
        return NextResponse.json(apiChannels);
      }
    }

    // No channels available — return error with invite URL hint
    return NextResponse.json({
      error: 'bot_not_installed',
      message: 'CacheGPT bot is not in this server. Ask a server admin to add it.',
      inviteUrl: botProxy.getInviteUrl(guildId),
    }, { status: 403 });
  } catch (error) {
    console.error('[Discord Channels] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
