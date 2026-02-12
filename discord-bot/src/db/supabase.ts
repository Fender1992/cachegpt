import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabase) {
    return supabase;
  }

  if (!config.supabase.url || !config.supabase.serviceKey) {
    console.warn('[DB] Supabase credentials not configured — database writes disabled');
    return null;
  }

  supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('[DB] Supabase client initialized');
  return supabase;
}

export interface GuildMetadataRow {
  id?: string;
  integration_id?: string;
  guild_id: string;
  guild_name: string;
  icon_url: string | null;
  owner_id: string;
  member_count: number;
  premium_tier: number;
  description: string | null;
  features: string[];
}

export interface ChannelMetadataRow {
  id?: string;
  integration_id?: string;
  guild_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: number;
  parent_id: string | null;
  topic: string | null;
  is_private: boolean;
  is_archived: boolean;
  last_message_id: string | null;
  message_count: number | null;
}

export async function upsertGuildMetadata(guild: GuildMetadataRow): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('discord_guild_metadata')
      .upsert(
        {
          guild_id: guild.guild_id,
          guild_name: guild.guild_name,
          icon_url: guild.icon_url,
          owner_id: guild.owner_id,
          member_count: guild.member_count,
          premium_tier: guild.premium_tier,
          description: guild.description,
          features: guild.features,
        },
        { onConflict: 'guild_id' }
      );

    if (error) {
      console.error('[DB] Failed to upsert guild metadata:', error.message);
    } else {
      console.log(`[DB] Upserted guild metadata for ${guild.guild_name} (${guild.guild_id})`);
    }
  } catch (err) {
    console.error('[DB] Error upserting guild metadata:', err);
  }
}

export async function upsertChannelMetadata(channel: ChannelMetadataRow): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('discord_channel_metadata')
      .upsert(
        {
          guild_id: channel.guild_id,
          channel_id: channel.channel_id,
          channel_name: channel.channel_name,
          channel_type: channel.channel_type,
          parent_id: channel.parent_id,
          topic: channel.topic,
          is_private: channel.is_private,
          is_archived: channel.is_archived,
          last_message_id: channel.last_message_id,
          message_count: channel.message_count,
        },
        { onConflict: 'channel_id' }
      );

    if (error) {
      console.error('[DB] Failed to upsert channel metadata:', error.message);
    } else {
      console.log(`[DB] Upserted channel metadata for #${channel.channel_name} (${channel.channel_id})`);
    }
  } catch (err) {
    console.error('[DB] Error upserting channel metadata:', err);
  }
}

export async function deleteChannelMetadata(channelId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('discord_channel_metadata')
      .delete()
      .eq('channel_id', channelId);

    if (error) {
      console.error('[DB] Failed to delete channel metadata:', error.message);
    } else {
      console.log(`[DB] Deleted channel metadata for ${channelId}`);
    }
  } catch (err) {
    console.error('[DB] Error deleting channel metadata:', err);
  }
}
