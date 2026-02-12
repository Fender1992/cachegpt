import {
  Client,
  GatewayIntentBits,
  Partials,
  Guild,
  Message,
  GuildChannel,
  DMChannel,
  NonThreadGuildBasedChannel,
} from 'discord.js';
import { config } from '../config';
import { handleGuildCreate } from './events/guildCreate';
import { handleMessageCreate } from './events/messageCreate';
import {
  handleChannelCreate,
  handleChannelUpdate,
  handleChannelDelete,
} from './events/channelUpdate';
import { PermissionOverwrite } from '../services/permissions';

// ── In-memory caches ────────────────────────────────────────────────────────

export interface CachedGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  ownerId: string;
}

export interface CachedChannel {
  id: string;
  guildId: string;
  name: string;
  type: number;
  parentId: string | null;
  topic: string | null;
  position: number;
  permissionOverwrites: PermissionOverwrite[];
}

export const guildCache = new Map<string, CachedGuild>();
export const channelCache = new Map<string, CachedChannel>();

// ── Discord.js Client ───────────────────────────────────────────────────────

let client: Client | null = null;

export function getClient(): Client {
  if (!client) {
    throw new Error('Discord client has not been initialized. Call createClient() first.');
  }
  return client;
}

export function createClient(): Client {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
    ],
  });

  // ── Event: Ready ────────────────────────────────────────────────────────
  client.once('ready', (readyClient) => {
    console.log(`[Gateway] Bot logged in as ${readyClient.user.tag}`);
    console.log(`[Gateway] Serving ${readyClient.guilds.cache.size} guild(s)`);

    // The guildCreate event fires for each guild on startup, so initial
    // caching is handled there. But we log the summary here.
    for (const [, guild] of readyClient.guilds.cache) {
      console.log(`[Gateway]   - ${guild.name} (${guild.id}) — ${guild.memberCount} members`);
    }
  });

  // ── Event: Guild Create (join or initial data) ──────────────────────────
  client.on('guildCreate', (guild: Guild) => {
    handleGuildCreate(guild).catch((err) => {
      console.error(`[Gateway] Error in guildCreate handler:`, err);
    });
  });

  // ── Event: Guild Delete (bot was removed) ───────────────────────────────
  client.on('guildDelete', (guild: Guild) => {
    console.log(`[Gateway] Removed from guild: ${guild.name} (${guild.id})`);
    guildCache.delete(guild.id);

    // Remove all cached channels for this guild
    for (const [channelId, channel] of channelCache) {
      if (channel.guildId === guild.id) {
        channelCache.delete(channelId);
      }
    }
  });

  // ── Event: Message Create ───────────────────────────────────────────────
  client.on('messageCreate', (message: Message) => {
    handleMessageCreate(message).catch((err) => {
      console.error(`[Gateway] Error in messageCreate handler:`, err);
    });
  });

  // ── Event: Channel Create ──────────────────────────────────────────────
  client.on('channelCreate', (channel: GuildChannel) => {
    handleChannelCreate(channel).catch((err) => {
      console.error(`[Gateway] Error in channelCreate handler:`, err);
    });
  });

  // ── Event: Channel Update ──────────────────────────────────────────────
  client.on('channelUpdate', (oldChannel, newChannel) => {
    handleChannelUpdate(
      oldChannel as DMChannel | GuildChannel,
      newChannel as DMChannel | GuildChannel
    ).catch((err) => {
      console.error(`[Gateway] Error in channelUpdate handler:`, err);
    });
  });

  // ── Event: Channel Delete ──────────────────────────────────────────────
  client.on('channelDelete', (channel) => {
    handleChannelDelete(channel as DMChannel | NonThreadGuildBasedChannel).catch((err) => {
      console.error(`[Gateway] Error in channelDelete handler:`, err);
    });
  });

  // ── Error & Debug ──────────────────────────────────────────────────────
  client.on('error', (error) => {
    console.error(`[Gateway] Client error:`, error);
  });

  client.on('warn', (warning) => {
    console.warn(`[Gateway] Warning:`, warning);
  });

  return client;
}

export async function loginClient(): Promise<void> {
  const c = getClient();
  console.log('[Gateway] Connecting to Discord Gateway...');
  await c.login(config.discord.botToken);
}
