/**
 * Discord Guilds API
 * GET: Fetch user's guilds from synced database metadata,
 *      cross-referenced with bot's guild list for access status
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { botProxy } from '@/lib/discord/bot-proxy';

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

    // Get the user's Discord integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    // Fetch guilds from synced metadata
    const { data: guilds, error } = await supabase
      .from('discord_guild_metadata')
      .select('guild_id, guild_name, icon_url, member_count, premium_tier')
      .eq('integration_id', integration.id)
      .order('guild_name');

    if (error) {
      console.error('[Discord Guilds] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch guilds' }, { status: 500 });
    }

    // Try to get bot's guild list for access status
    let botGuildIds = new Set<string>();
    try {
      const botAvailable = await botProxy.isAvailable();
      if (botAvailable) {
        const botGuilds = await botProxy.getGuilds();
        botGuildIds = new Set(botGuilds.map(g => g.id));
      }
    } catch (err) {
      // Bot proxy unavailable, all guilds will show as unknown status
    }

    // Map to Discord-compatible format with bot status
    const result = (guilds || []).map(g => ({
      id: g.guild_id,
      name: g.guild_name,
      icon: g.icon_url,
      member_count: g.member_count,
      botStatus: botGuildIds.size > 0
        ? (botGuildIds.has(g.guild_id) ? 'full_access' : 'no_bot')
        : 'unknown' as const,
    }));

    // Sort: full_access first, then no_bot, then unknown
    const statusOrder: Record<string, number> = { full_access: 0, unknown: 1, no_bot: 2 };
    result.sort((a, b) => (statusOrder[a.botStatus] ?? 1) - (statusOrder[b.botStatus] ?? 1) || a.name.localeCompare(b.name));

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Discord Guilds] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch guilds' }, { status: 500 });
  }
}
