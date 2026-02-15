/**
 * Discord Client Wrapper
 * Routes all Discord API calls through our backend proxy to avoid
 * OAuth2 scope limitations (guild endpoints require Bot tokens when
 * called directly, but our backend proxies them server-side).
 *
 * Caching strategy:
 * - Guilds: cached until explicit refresh, revalidated on connect
 * - Channels per guild: cached with TTL, revalidated on guild select
 * - Messages per channel: cached, diff-based polling fetches only new messages
 */

import { DiscordMessage, DiscordChannel, DiscordGuild } from './discord-gateway';
import { supabase } from '@/lib/supabase-client';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  global_name?: string;
  avatar?: string;
}

export interface DiscordState {
  isConnected: boolean;
  isConnecting: boolean;
  user: DiscordUser | null;
  guilds: DiscordGuild[];
  selectedGuild: DiscordGuild | null;
  channels: DiscordChannel[];
  selectedChannel: DiscordChannel | null;
  messages: DiscordMessage[];
  hasMoreMessages: boolean;
  loadingMore: boolean;
  unreadCount: number;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CHANNEL_CACHE_TTL = 5 * 60_000; // 5 minutes
const POLL_INTERVAL = 30_000; // 30 seconds — only fetches new messages via diff
const INITIAL_MESSAGE_LIMIT = 10;
const LOAD_MORE_LIMIT = 20;

export class DiscordClient {
  private connected = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Set<(state: DiscordState) => void> = new Set();
  private state: DiscordState = {
    isConnected: false,
    isConnecting: false,
    user: null,
    guilds: [],
    selectedGuild: null,
    channels: [],
    selectedChannel: null,
    messages: [],
    hasMoreMessages: false,
    loadingMore: false,
    unreadCount: 0,
    error: null,
  };

  // Caches
  private channelCache = new Map<string, CacheEntry<DiscordChannel[]>>(); // guildId -> channels
  private messageCache = new Map<string, DiscordMessage[]>(); // channelId -> messages

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: DiscordState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update state and notify listeners
   */
  private updateState(partial: Partial<DiscordState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Get current state
   */
  getState(): DiscordState {
    return this.state;
  }

  /**
   * Get auth header for our API routes
   */
  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  /**
   * Connect — validate Discord integration and load user info + guilds
   */
  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) {
      return;
    }

    try {
      this.updateState({ isConnecting: true, error: null });

      const headers = await this.getAuthHeader();

      // Check Discord integration status (returns user info from provider_data)
      const statusRes = await fetch('/api/integrations/discord', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Discord status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Discord not connected. Please link your Discord account in Settings.');
      }

      // Build user from provider_data
      const pd = status.providerData || {};
      const user: DiscordUser = {
        id: status.providerUserId || '',
        username: pd.username || 'Unknown',
        discriminator: pd.discriminator,
        global_name: pd.global_name,
        avatar: pd.avatar,
      };

      // Fetch guilds through our proxy
      const guildsRes = await fetch('/api/integrations/discord/guilds', { headers });
      const guilds: DiscordGuild[] = guildsRes.ok ? await guildsRes.json() : [];

      this.connected = true;
      this.updateState({
        isConnected: true,
        isConnecting: false,
        user,
        guilds,
        error: null,
      });

    } catch (error) {
      console.error('[Discord Client] Connection error:', error);
      this.connected = false;
      const errorMsg = error instanceof Error ? error.message : 'Failed to connect to Discord';
      this.updateState({
        isConnecting: false,
        error: errorMsg,
      });

      // Auto-retry on transient failures (not on "not connected" which means user hasn't linked Discord)
      const isPermanentError = errorMsg.includes('not connected') || errorMsg.includes('Please link');
      if (!isPermanentError) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Reconnect — clears error state and retries connection.
   * Called automatically on transient failures or manually via UI.
   */
  async reconnect(): Promise<void> {
    this.connected = false;
    this.updateState({ isConnected: false, isConnecting: false, error: null });
    this.reconnectAttempts = 0;
    return this.connect();
  }

  /**
   * Schedule an automatic reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.connected && !this.state.isConnecting) {
        this.updateState({ error: null });
        await this.connect().catch(() => {});
      }
    }, delay);
  }

  /**
   * Disconnect from Discord
   */
  disconnect(): void {
    this.stopPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connected = false;
    this.channelCache.clear();
    this.messageCache.clear();

    this.updateState({
      isConnected: false,
      isConnecting: false,
      user: null,
      guilds: [],
      selectedGuild: null,
      channels: [],
      selectedChannel: null,
      messages: [],
      hasMoreMessages: false,
      loadingMore: false,
      unreadCount: 0,
    });
  }

  /**
   * Select a guild and load its channels (from cache if fresh)
   */
  async selectGuild(guild: DiscordGuild): Promise<void> {
    if (!this.connected) return;

    try {
      this.stopPolling();
      this.updateState({ selectedGuild: guild, selectedChannel: null, messages: [], error: null });

      // If the bot is not installed in this guild, don't try to fetch channels
      if (guild.botStatus === 'no_bot') {
        this.updateState({ error: 'bot_not_installed' });
        return;
      }

      // Check channel cache
      const cached = this.channelCache.get(guild.id);
      if (cached && (Date.now() - cached.fetchedAt) < CHANNEL_CACHE_TTL) {
        this.updateState({ channels: cached.data });
        return;
      }

      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/integrations/discord/channels?guildId=${guild.id}`, { headers });

      if (!res.ok) {
        if (res.status === 403) {
          this.updateState({ error: 'bot_not_installed' });
          return;
        }
        throw new Error(`Failed to load channels: ${res.status}`);
      }

      const channels: DiscordChannel[] = await res.json();

      // Filter to text channels only (type 0) and sort by name
      const textChannels = channels
        .filter(ch => ch.type === 0)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // Cache the channels
      this.channelCache.set(guild.id, { data: textChannels, fetchedAt: Date.now() });
      this.updateState({ channels: textChannels });

    } catch (error) {
      console.error('[Discord Client] Error selecting guild:', error);
      this.updateState({ error: 'Failed to load channels' });
    }
  }

  /**
   * Get the bot invite URL for a specific guild
   */
  getInviteUrl(guildId: string): string {
    const clientId = typeof window !== 'undefined'
      ? (window as any).__ENV__?.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || ''
      : process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=66560&guild_id=${guildId}&disable_guild_select=true`;
  }

  /**
   * Select a channel and load its messages (from cache, then diff for new)
   */
  async selectChannel(channel: DiscordChannel): Promise<void> {
    if (!this.connected) return;

    try {
      this.stopPolling();

      // Serve cached messages immediately if available
      const cachedMessages = this.messageCache.get(channel.id);
      if (cachedMessages && cachedMessages.length > 0) {
        this.updateState({ selectedChannel: channel, messages: cachedMessages });
        // Diff-fetch new messages since last cached message
        this.fetchNewMessages(channel.id, cachedMessages);
      } else {
        this.updateState({ selectedChannel: channel, messages: [] });
        await this.fetchAllMessages(channel.id);
      }

      // Start light polling for new messages (diff only)
      this.startPolling(channel.id);

    } catch (error) {
      console.error('[Discord Client] Error selecting channel:', error);
      this.updateState({ error: 'Failed to load messages' });
    }
  }

  /**
   * Fetch full message history for a channel (initial load)
   */
  private async fetchAllMessages(channelId: string): Promise<void> {
    const headers = await this.getAuthHeader();
    const res = await fetch(
      `/api/integrations/discord/messages?channelId=${channelId}&limit=${INITIAL_MESSAGE_LIMIT}`,
      { headers }
    );

    if (!res.ok) {
      throw new Error(`Failed to load messages: ${res.status}`);
    }

    const messages: DiscordMessage[] = await res.json();
    const sorted = messages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    this.messageCache.set(channelId, sorted);
    this.updateState({ messages: sorted, hasMoreMessages: messages.length >= INITIAL_MESSAGE_LIMIT });
  }

  /**
   * Diff-fetch: only get messages newer than the last cached one
   */
  private async fetchNewMessages(channelId: string, existing: DiscordMessage[]): Promise<void> {
    try {
      const lastMessage = existing[existing.length - 1];
      if (!lastMessage) return;

      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/discord/messages?channelId=${channelId}&limit=${LOAD_MORE_LIMIT}&after=${lastMessage.id}`,
        { headers }
      );

      if (!res.ok) return;

      const newMessages: DiscordMessage[] = await res.json();
      if (newMessages.length === 0) return;

      const sorted = newMessages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const merged = [...existing, ...sorted];
      this.messageCache.set(channelId, merged);

      // Only update UI if we're still viewing this channel
      if (this.state.selectedChannel?.id === channelId) {
        this.updateState({ messages: merged });
      }
    } catch (error) {
      console.error('[Discord Client] Diff fetch error:', error);
    }
  }

  /**
   * Load older messages (before the oldest cached message)
   */
  async loadOlderMessages(): Promise<void> {
    if (!this.connected || !this.state.selectedChannel || this.state.loadingMore) return;

    const channelId = this.state.selectedChannel.id;
    const existing = this.messageCache.get(channelId) || [];
    const oldestMessage = existing[0];
    if (!oldestMessage) return;

    try {
      this.updateState({ loadingMore: true });

      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/discord/messages?channelId=${channelId}&limit=${LOAD_MORE_LIMIT}&before=${oldestMessage.id}`,
        { headers }
      );

      if (!res.ok) return;

      const olderMessages: DiscordMessage[] = await res.json();
      if (olderMessages.length === 0) {
        this.updateState({ hasMoreMessages: false, loadingMore: false });
        return;
      }

      const sorted = olderMessages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const merged = [...sorted, ...existing];
      this.messageCache.set(channelId, merged);

      if (this.state.selectedChannel?.id === channelId) {
        this.updateState({
          messages: merged,
          hasMoreMessages: olderMessages.length >= LOAD_MORE_LIMIT,
          loadingMore: false,
        });
      }
    } catch (error) {
      console.error('[Discord Client] Load older messages error:', error);
      this.updateState({ loadingMore: false });
    }
  }

  /**
   * Send a message to the selected channel
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.connected || !this.state.selectedChannel) {
      throw new Error('No channel selected');
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/integrations/discord/messages', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: this.state.selectedChannel.id,
          content,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to send message: ${res.status}`);
      }

      const message: DiscordMessage = await res.json();
      const channelId = this.state.selectedChannel.id;

      // Add to cache and state
      const cached = this.messageCache.get(channelId) || [];
      const updated = [...cached, message];
      this.messageCache.set(channelId, updated);
      this.updateState({ messages: updated });
    } catch (error) {
      console.error('[Discord Client] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Clear unread count
   */
  clearUnreadCount(): void {
    this.updateState({ unreadCount: 0 });
  }

  /**
   * Start light polling — only fetches new messages (diff) every 30s
   */
  private startPolling(channelId: string): void {
    this.stopPolling();

    this.pollInterval = setInterval(async () => {
      if (!this.connected || this.state.selectedChannel?.id !== channelId) {
        this.stopPolling();
        return;
      }

      const cached = this.messageCache.get(channelId) || [];
      await this.fetchNewMessages(channelId, cached);
    }, POLL_INTERVAL);
  }

  /**
   * Stop polling for messages
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// Global client instance
export const discordClient = new DiscordClient();
