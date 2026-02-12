/**
 * Discord Guilds API
 * GET: Fetch user's guilds from synced database metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';

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

    // Map to Discord-compatible format
    const result = (guilds || []).map(g => ({
      id: g.guild_id,
      name: g.guild_name,
      icon: g.icon_url,
      member_count: g.member_count,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Discord Guilds] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch guilds' }, { status: 500 });
  }
}
