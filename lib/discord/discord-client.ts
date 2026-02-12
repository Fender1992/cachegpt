/**
 * Discord Client Wrapper
 * Routes all Discord API calls through our backend proxy to avoid
 * OAuth2 scope limitations (guild endpoints require Bot tokens when
 * called directly, but our backend proxies them server-side).
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
  unreadCount: number;
  error: string | null;
}

export class DiscordClient {
  private connected = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
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
    unreadCount: 0,
    error: null,
  };

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

      console.log('[Discord Client] Connected as', user.username);

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
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Discord'
      });
    }
  }

  /**
   * Disconnect from Discord
   */
  disconnect(): void {
    this.stopPolling();
    this.connected = false;

    this.updateState({
      isConnected: false,
      isConnecting: false,
      user: null,
      guilds: [],
      selectedGuild: null,
      channels: [],
      selectedChannel: null,
      messages: [],
      unreadCount: 0,
    });
  }

  /**
   * Select a guild and load its channels
   */
  async selectGuild(guild: DiscordGuild): Promise<void> {
    if (!this.connected) return;

    try {
      this.stopPolling();
      this.updateState({ selectedGuild: guild, selectedChannel: null, messages: [], channels: [], error: null });

      // If the bot is not installed in this guild, don't try to fetch channels
      if (guild.botStatus === 'no_bot') {
        this.updateState({ error: 'bot_not_installed' });
        return;
      }

      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/integrations/discord/channels?guildId=${guild.id}`, { headers });

      if (!res.ok) {
        if (res.status === 403) {
          // 403 means the bot doesn't have access to this guild
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
   * Select a channel and load its messages
   */
  async selectChannel(channel: DiscordChannel): Promise<void> {
    if (!this.connected) return;

    try {
      this.stopPolling();
      this.updateState({ selectedChannel: channel, messages: [] });

      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/discord/messages?channelId=${channel.id}&limit=50`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const messages: DiscordMessage[] = await res.json();

      // Sort messages by timestamp (oldest first) — API returns newest first
      const sortedMessages = messages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      this.updateState({ messages: sortedMessages });

    } catch (error) {
      console.error('[Discord Client] Error selecting channel:', error);
      this.updateState({ error: 'Failed to load messages' });
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

      // Add sent message to state immediately
      this.updateState({
        messages: [...this.state.messages, message],
      });
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
   * Start polling for new messages in the selected channel
   */
  private startPolling(channelId: string): void {
    this.stopPolling();

    this.pollInterval = setInterval(async () => {
      if (!this.connected || this.state.selectedChannel?.id !== channelId) {
        this.stopPolling();
        return;
      }

      try {
        const headers = await this.getAuthHeader();
        const lastMessage = this.state.messages[this.state.messages.length - 1];
        const afterParam = lastMessage ? `&after=${lastMessage.id}` : '';

        const res = await fetch(
          `/api/integrations/discord/messages?channelId=${channelId}&limit=50${afterParam}`,
          { headers }
        );

        if (!res.ok) return;

        const newMessages: DiscordMessage[] = await res.json();

        if (newMessages.length > 0) {
          const sorted = newMessages.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          this.updateState({
            messages: [...this.state.messages, ...sorted],
          });
        }
      } catch (error) {
        console.error('[Discord Client] Polling error:', error);
      }
    }, 5000);
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
