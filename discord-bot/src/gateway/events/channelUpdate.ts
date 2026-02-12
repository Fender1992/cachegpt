import {
  DMChannel,
  GuildChannel,
  NonThreadGuildBasedChannel,
  ChannelType,
  TextChannel,
  NewsChannel,
  ForumChannel,
} from 'discord.js';
import { channelCache } from '../client';
import { upsertChannelMetadata, deleteChannelMetadata } from '../../db/supabase';

/**
 * Handle CHANNEL_CREATE — a new channel was created in a guild.
 */
export async function handleChannelCreate(channel: GuildChannel): Promise<void> {
  if (!channel.guild) return;

  console.log(
    `[Gateway] Channel created: #${channel.name} (${channel.id}) in ${channel.guild.name}`
  );

  const overwrites = 'permissionOverwrites' in channel
    ? channel.permissionOverwrites.cache.map((ow) => ({
        id: ow.id,
        type: ow.type,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      }))
    : [];

  channelCache.set(channel.id, {
    id: channel.id,
    guildId: channel.guild.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    topic: 'topic' in channel ? (channel as TextChannel | NewsChannel | ForumChannel).topic : null,
    position: channel.position,
    permissionOverwrites: overwrites,
  });

  // Upsert to Supabase for text-like channels
  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum
  ) {
    const textChannel = channel as TextChannel | NewsChannel | ForumChannel;
    upsertChannelMetadata({
      guild_id: channel.guild.id,
      channel_id: channel.id,
      channel_name: channel.name,
      channel_type: channel.type,
      parent_id: channel.parentId,
      topic: textChannel.topic,
      is_private: !channel.permissionsFor(channel.guild.roles.everyone)?.has('ViewChannel'),
      is_archived: false,
      last_message_id: 'lastMessageId' in textChannel ? textChannel.lastMessageId : null,
      message_count: null,
    }).catch((err) => {
      console.error(`[Gateway] Failed to upsert new channel to Supabase:`, err);
    });
  }
}

/**
 * Handle CHANNEL_UPDATE — a channel was modified (name, topic, permissions, etc.).
 */
export async function handleChannelUpdate(
  oldChannel: DMChannel | GuildChannel,
  newChannel: DMChannel | GuildChannel
): Promise<void> {
  // Skip DM channels
  if (!('guild' in newChannel) || !newChannel.guild) return;

  const guildChannel = newChannel as GuildChannel;

  console.log(
    `[Gateway] Channel updated: #${guildChannel.name} (${guildChannel.id}) in ${guildChannel.guild.name}`
  );

  const overwrites = 'permissionOverwrites' in guildChannel
    ? guildChannel.permissionOverwrites.cache.map((ow) => ({
        id: ow.id,
        type: ow.type,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      }))
    : [];

  channelCache.set(guildChannel.id, {
    id: guildChannel.id,
    guildId: guildChannel.guild.id,
    name: guildChannel.name,
    type: guildChannel.type,
    parentId: guildChannel.parentId,
    topic: 'topic' in guildChannel ? (guildChannel as TextChannel | NewsChannel | ForumChannel).topic : null,
    position: guildChannel.position,
    permissionOverwrites: overwrites,
  });

  // Update Supabase
  if (
    guildChannel.type === ChannelType.GuildText ||
    guildChannel.type === ChannelType.GuildAnnouncement ||
    guildChannel.type === ChannelType.GuildForum
  ) {
    const textChannel = guildChannel as TextChannel | NewsChannel | ForumChannel;
    upsertChannelMetadata({
      guild_id: guildChannel.guild.id,
      channel_id: guildChannel.id,
      channel_name: guildChannel.name,
      channel_type: guildChannel.type,
      parent_id: guildChannel.parentId,
      topic: textChannel.topic,
      is_private: !guildChannel.permissionsFor(guildChannel.guild.roles.everyone)?.has('ViewChannel'),
      is_archived: false,
      last_message_id: 'lastMessageId' in textChannel ? textChannel.lastMessageId : null,
      message_count: null,
    }).catch((err) => {
      console.error(`[Gateway] Failed to update channel in Supabase:`, err);
    });
  }
}

/**
 * Handle CHANNEL_DELETE — a channel was deleted from a guild.
 */
export async function handleChannelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel
): Promise<void> {
  // Skip DM channels
  if (!('guild' in channel) || !channel.guild) return;

  console.log(
    `[Gateway] Channel deleted: #${channel.name} (${channel.id}) in ${channel.guild.name}`
  );

  // Remove from in-memory cache
  channelCache.delete(channel.id);

  // Remove from Supabase
  deleteChannelMetadata(channel.id).catch((err) => {
    console.error(`[Gateway] Failed to delete channel from Supabase:`, err);
  });
}
