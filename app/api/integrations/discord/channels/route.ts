/**
 * Discord Channels API
 * GET: Fetch channels for a guild via Discord API using Bot token
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

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Discord Channels] API error:', response.status, text);
      return NextResponse.json({ error: text }, { status: response.status });
    }

    const channels = await response.json();
    return NextResponse.json(channels);
  } catch (error) {
    console.error('[Discord Channels] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
