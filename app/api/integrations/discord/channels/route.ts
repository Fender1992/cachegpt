/**
 * Discord Channels API
 * GET: Fetch channels for a guild from synced database metadata
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

    const guildId = req.nextUrl.searchParams.get('guildId');
    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
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

    // Fetch channels from synced metadata
    const { data: channels, error } = await supabase
      .from('discord_channel_metadata')
      .select('channel_id, channel_name, channel_type, topic, parent_id, last_message_id')
      .eq('integration_id', integration.id)
      .eq('guild_id', guildId)
      .order('channel_name');

    if (error) {
      console.error('[Discord Channels] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
    }

    // Map to Discord-compatible format
    const result = (channels || []).map(ch => ({
      id: ch.channel_id,
      name: ch.channel_name,
      type: ch.channel_type,
      topic: ch.topic,
      guild_id: guildId,
      parent_id: ch.parent_id,
      last_message_id: ch.last_message_id,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Discord Channels] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
