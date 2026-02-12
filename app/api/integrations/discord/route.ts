/**
 * Discord Integration Status API
 * GET: Retrieve Discord integration status
 * DELETE: Disconnect Discord integration
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

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', authResult.userId)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        syncing: false,
        documentCount: 0,
        guildCount: 0,
        channelCount: 0,
        lastSyncedAt: null,
        providerUserId: null,
        providerData: {},
      });
    }

    // Get document count
    const { count: documentCount } = await supabase
      .from('integration_documents')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', integration.id);

    // Get guild and channel counts
    const { count: guildCount } = await supabase
      .from('discord_guild_metadata')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', integration.id);

    const { count: channelCount } = await supabase
      .from('discord_channel_metadata')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', integration.id);

    return NextResponse.json({
      connected: integration.status !== 'disconnected',
      syncing: integration.status === 'syncing',
      documentCount: documentCount || 0,
      guildCount: guildCount || 0,
      channelCount: channelCount || 0,
      lastSyncedAt: integration.last_synced_at,
      providerUserId: integration.provider_user_id,
      providerData: integration.provider_data || {},
    });
  } catch (error) {
    console.error('[Discord Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Discord status' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // Get integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', authResult.userId)
      .eq('provider', 'discord')
      .single();

    if (!integration) {
      return NextResponse.json({ message: 'No Discord integration found' });
    }

    // Delete integration (cascades to documents and metadata)
    await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    return NextResponse.json({ message: 'Discord integration disconnected' });
  } catch (error) {
    console.error('[Discord Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Discord' },
      { status: 500 }
    );
  }
}