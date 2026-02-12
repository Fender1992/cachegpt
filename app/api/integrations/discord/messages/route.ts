/**
 * Discord Messages API
 * GET: Fetch messages from synced integration_documents for a channel
 * POST: Send a message via Discord API using stored access token
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

    const channelId = req.nextUrl.searchParams.get('channelId');
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
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

    // Fetch synced message documents for this channel
    const { data: docs, error } = await supabase
      .from('integration_documents')
      .select('id, content, metadata, created_at, updated_at')
      .eq('integration_id', integration.id)
      .eq('provider', 'discord')
      .filter('metadata->>channel_id', 'eq', channelId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[Discord Messages] DB error:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Transform integration_documents into a message-like format for the UI
    const messages = (docs || []).map(doc => {
      const meta = doc.metadata || {};
      const authors: string[] = meta.authors || [];
      return {
        id: doc.id,
        channel_id: channelId,
        guild_id: meta.guild_id,
        author: {
          id: 'synced',
          username: authors[0] || 'Unknown',
          global_name: authors[0] || 'Unknown',
        },
        content: doc.content,
        timestamp: meta.first_message_at || doc.created_at,
        edited_timestamp: null,
        mentions: [],
        mention_everyone: false,
        attachments: [],
        embeds: [],
        type: 0,
        // Extra metadata for the UI
        _synced: true,
        _authors: authors,
        _messageCount: meta.message_count,
        _guildName: meta.guild_name,
        _channelName: meta.channel_name,
      };
    });

    return NextResponse.json(messages);
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

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'discord')
      .single();

    if (!integration?.access_token) {
      return NextResponse.json({ error: 'Discord not connected' }, { status: 404 });
    }

    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: text }, { status: response.status });
    }

    const message = await response.json();
    return NextResponse.json(message);
  } catch (error) {
    console.error('[Discord Send Message] Error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
