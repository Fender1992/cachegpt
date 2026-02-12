import { Guild, ChannelType, TextChannel, NewsChannel, ForumChannel } from 'discord.js';
import { guildCache, channelCache } from '../client';
import { upsertGuildMetadata, upsertChannelMetadata } from '../../db/supabase';

/**
 * Handle the guildCreate event.
 * Fired when:
 *  - The bot joins a new guild
 *  - The bot receives initial guild data on startup (for each guild)
 */
export async function handleGuildCreate(guild: Guild): Promise<void> {
  console.log(`[Gateway] Guild available: ${guild.name} (${guild.id}) — ${guild.memberCount} members`);

  // Cache guild info in memory
  guildCache.set(guild.id, {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ size: 128 }),
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
  });

  // Cache all channels in memory
  const guildChannels = guild.channels.cache;
  for (const [channelId, channel] of guildChannels) {
    // Only cache text-based and category channels
    if (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildCategory ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildForum ||
      channel.type === ChannelType.GuildStageVoice ||
      channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread ||
      channel.type === ChannelType.AnnouncementThread
    ) {
      const overwrites = 'permissionOverwrites' in channel
        ? channel.permissionOverwrites.cache.map((ow) => ({
            id: ow.id,
            type: ow.type,
            allow: ow.allow.bitfield.toString(),
            deny: ow.deny.bitfield.toString(),
          }))
        : [];

      channelCache.set(channelId, {
        id: channelId,
        guildId: guild.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        topic: 'topic' in channel ? (channel as TextChannel | NewsChannel | ForumChannel).topic : null,
        position: 'position' in channel ? (channel as any).position : 0,
        permissionOverwrites: overwrites,
      });
    }
  }

  console.log(`[Gateway] Cached ${guildChannels.size} channels for guild ${guild.name}`);

  // Upsert to Supabase (best-effort, non-blocking)
  upsertGuildMetadata({
    guild_id: guild.id,
    guild_name: guild.name,
    icon_url: guild.iconURL({ size: 128 }),
    owner_id: guild.ownerId,
    member_count: guild.memberCount,
    premium_tier: guild.premiumTier,
    description: guild.description,
    features: guild.features,
  }).catch((err) => {
    console.error(`[Gateway] Failed to upsert guild to Supabase:`, err);
  });

  // Upsert channels to Supabase (best-effort, non-blocking)
  for (const [channelId, channel] of guildChannels) {
    if (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildForum
    ) {
      const textChannel = channel as TextChannel | NewsChannel | ForumChannel;
      upsertChannelMetadata({
        guild_id: guild.id,
        channel_id: channelId,
        channel_name: channel.name,
        channel_type: channel.type,
        parent_id: channel.parentId,
        topic: textChannel.topic,
        is_private: !guildChannels.get(channelId)?.permissionsFor(guild.roles.everyone)?.has('ViewChannel'),
        is_archived: false,
        last_message_id: 'lastMessageId' in textChannel ? textChannel.lastMessageId : null,
        message_count: null,
      }).catch((err) => {
        console.error(`[Gateway] Failed to upsert channel to Supabase:`, err);
      });
    }
  }
}
