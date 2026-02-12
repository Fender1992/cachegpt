/**
 * Discord Client Wrapper
 * Uses Discord REST API with OAuth2 tokens (not the Gateway WebSocket)
 */

import { DiscordMessage, DiscordChannel, DiscordGuild } from './discord-gateway';
import { supabase } from '@/lib/supabase-client';

const DISCORD_API = 'https://discord.com/api/v10';

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
  private token: string | null = null;
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
   * Connect to Discord via REST API
   */
  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) {
      return;
    }

    try {
      this.updateState({ isConnecting: true, error: null });

      const token = await this.getDiscordToken();
      if (!token) {
        throw new Error('No Discord token found. Please link your Discord account.');
      }

      this.token = token;

      // Validate token by fetching user info
      const user = await this.apiFetch<DiscordUser>('/users/@me');
      console.log('[Discord Client] Connected as', user.username);

      // Fetch guilds
      const guilds = await this.apiFetch<DiscordGuild[]>('/users/@me/guilds');

      this.updateState({
        isConnected: true,
        isConnecting: false,
        user,
        guilds,
        error: null,
      });

    } catch (error) {
      console.error('[Discord Client] Connection error:', error);
      this.token = null;
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
    this.token = null;

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
    if (!this.token) return;

    try {
      this.stopPolling();
      this.updateState({ selectedGuild: guild, selectedChannel: null, messages: [] });

      const channels = await this.apiFetch<DiscordChannel[]>(`/guilds/${guild.id}/channels`);

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
   * Select a channel and load its messages
   */
  async selectChannel(channel: DiscordChannel): Promise<void> {
    if (!this.token) return;

    try {
      this.stopPolling();
      this.updateState({ selectedChannel: channel, messages: [] });

      const messages = await this.apiFetch<DiscordMessage[]>(
        `/channels/${channel.id}/messages?limit=50`
      );

      // Sort messages by timestamp (oldest first) — API returns newest first
      const sortedMessages = messages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      this.updateState({ messages: sortedMessages });

      // Start polling for new messages
      this.startPolling(channel.id);

    } catch (error) {
      console.error('[Discord Client] Error selecting channel:', error);
      this.updateState({ error: 'Failed to load messages' });
    }
  }

  /**
   * Send a message to the selected channel
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.token || !this.state.selectedChannel) {
      throw new Error('No channel selected');
    }

    try {
      const message = await this.apiFetch<DiscordMessage>(
        `/channels/${this.state.selectedChannel.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        }
      );

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
   * Make an authenticated request to the Discord API
   */
  private async apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Discord API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Start polling for new messages in the selected channel
   */
  private startPolling(channelId: string): void {
    this.stopPolling();

    this.pollInterval = setInterval(async () => {
      if (!this.token || this.state.selectedChannel?.id !== channelId) {
        this.stopPolling();
        return;
      }

      try {
        const lastMessage = this.state.messages[this.state.messages.length - 1];
        const afterParam = lastMessage ? `&after=${lastMessage.id}` : '';

        const newMessages = await this.apiFetch<DiscordMessage[]>(
          `/channels/${channelId}/messages?limit=50${afterParam}`
        );

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
    }, 5000); // Poll every 5 seconds
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

  /**
   * Get Discord token from Supabase
   */
  private async getDiscordToken(): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;

      // Query user's Discord credentials from integrations table
      const { data, error } = await supabase
        .from('user_integrations')
        .select('access_token')
        .eq('user_id', session.user.id)
        .eq('provider', 'discord')
        .single();

      if (error) {
        console.error('[Discord Client] Error fetching token:', error);
        return null;
      }

      return data?.access_token || null;

    } catch (error) {
      console.error('[Discord Client] Error getting Discord token:', error);
      return null;
    }
  }
}

// Global client instance
export const discordClient = new DiscordClient();
