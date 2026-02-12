const BOT_API_URL = process.env.DISCORD_BOT_API_URL || 'http://localhost:3100';

export interface BotGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

export interface BotChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  topic: string | null;
  position: number;
  guild_id?: string;
}

export interface BotMessage {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    discriminator?: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  attachments?: any[];
  embeds?: any[];
  referenced_message?: any;
}

export interface BotMember {
  userId: string;
  roles: string[];
  nick?: string | null;
  joinedAt: string;
}

export type GuildAccessStatus = 'full_access' | 'no_bot' | 'unknown';

export interface GuildWithStatus extends BotGuild {
  botStatus: GuildAccessStatus;
}

class BotProxyClient {
  private baseUrl: string;
  private healthCache: { available: boolean; checkedAt: number } | null = null;
  private static HEALTH_CACHE_TTL = 60_000; // Cache health check for 60 seconds

  constructor() {
    this.baseUrl = BOT_API_URL;
  }

  /**
   * Check if the bot service is reachable (cached for 60s)
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.healthCache && (now - this.healthCache.checkedAt) < BotProxyClient.HEALTH_CACHE_TTL) {
      return this.healthCache.available;
    }
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      this.healthCache = { available: res.ok, checkedAt: now };
      return res.ok;
    } catch {
      this.healthCache = { available: false, checkedAt: now };
      return false;
    }
  }

  /**
   * Get all guilds the bot is in
   */
  async getGuilds(): Promise<BotGuild[]> {
    const res = await fetch(`${this.baseUrl}/api/guilds`);
    if (!res.ok) throw new Error(`Bot API error: ${res.status}`);
    return res.json();
  }

  /**
   * Get channels for a guild, filtered by user permissions
   */
  async getGuildChannels(guildId: string, userId?: string): Promise<BotChannel[]> {
    const params = userId ? `?userId=${userId}` : '';
    const res = await fetch(`${this.baseUrl}/api/guilds/${guildId}/channels${params}`);
    if (!res.ok) throw new Error(`Bot API error: ${res.status}`);
    return res.json();
  }

  /**
   * Get messages from a channel
   */
  async getMessages(channelId: string, options?: { limit?: number; before?: string; after?: string }): Promise<BotMessage[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', options.before);
    if (options?.after) params.set('after', options.after);
    const qs = params.toString() ? `?${params}` : '';
    const res = await fetch(`${this.baseUrl}/api/channels/${channelId}/messages${qs}`);
    if (!res.ok) throw new Error(`Bot API error: ${res.status}`);
    return res.json();
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(channelId: string, content: string): Promise<BotMessage> {
    const res = await fetch(`${this.baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Bot API error: ${res.status}`);
    return res.json();
  }

  /**
   * Get a guild member with their roles
   */
  async getMember(guildId: string, userId: string): Promise<BotMember> {
    const res = await fetch(`${this.baseUrl}/api/guilds/${guildId}/members/${userId}`);
    if (!res.ok) throw new Error(`Bot API error: ${res.status}`);
    return res.json();
  }

  /**
   * Generate a bot invite URL for a specific guild
   */
  getInviteUrl(guildId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '';
    // VIEW_CHANNEL (1024) + READ_MESSAGE_HISTORY (65536) = 66560
    const permissions = '66560';
    let url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${permissions}`;
    if (guildId) {
      url += `&guild_id=${guildId}&disable_guild_select=true`;
    }
    return url;
  }
}

// Singleton instance
export const botProxy = new BotProxyClient();
