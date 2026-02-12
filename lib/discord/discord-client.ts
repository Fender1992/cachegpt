/**
 * Discord Client Wrapper
 * Provides a higher-level interface for Discord interactions
 */

import { DiscordGatewayClient, DiscordMessage, DiscordChannel, DiscordGuild } from './discord-gateway';
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
  private gateway: DiscordGatewayClient | null = null;
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
    // Send current state immediately
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
   * Connect to Discord
   */
  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) {
      return;
    }

    try {
      this.updateState({ isConnecting: true, error: null });

      // Get Discord token from Supabase
      const token = await this.getDiscordToken();
      if (!token) {
        throw new Error('No Discord token found. Please link your Discord account.');
      }

      // Create gateway client
      this.gateway = new DiscordGatewayClient(token);
      this.setupEventListeners();

      // Connect to gateway
      this.gateway.connect();

    } catch (error) {
      console.error('[Discord Client] Connection error:', error);
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
    if (this.gateway) {
      this.gateway.disconnect();
      this.gateway.removeAllListeners();
      this.gateway = null;
    }

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
    if (!this.gateway) return;

    try {
      this.updateState({ selectedGuild: guild, selectedChannel: null, messages: [] });
      
      // Fetch channels for the guild
      const channels = await this.gateway.fetchChannels(guild.id);
      
      // Filter to text channels only (type 0) and sort by position/name
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
    if (!this.gateway) return;

    try {
      this.updateState({ selectedChannel: channel, messages: [] });

      // Fetch recent messages from the channel
      const messages = await this.gateway.fetchMessages(channel.id, 50);
      
      // Sort messages by timestamp (oldest first)
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
    if (!this.gateway || !this.state.selectedChannel) {
      throw new Error('No channel selected');
    }

    try {
      await this.gateway.sendMessage(this.state.selectedChannel.id, content);
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

  /**
   * Setup event listeners for the gateway
   */
  private setupEventListeners(): void {
    if (!this.gateway) return;

    this.gateway.on('connected', () => {
      console.log('[Discord Client] Connected to gateway');
    });

    this.gateway.on('ready', async (data: any) => {
      console.log('[Discord Client] Gateway ready');
      this.updateState({ 
        isConnected: true, 
        isConnecting: false, 
        user: data.user,
        error: null
      });

      try {
        // Load user's guilds
        const guilds = await this.gateway!.fetchGuilds();
        this.updateState({ guilds });
      } catch (error) {
        console.error('[Discord Client] Error loading guilds:', error);
      }
    });

    this.gateway.on('messageCreate', (message: DiscordMessage) => {
      // Add new message if it's for the selected channel
      if (message.channel_id === this.state.selectedChannel?.id) {
        this.updateState({
          messages: [...this.state.messages, message]
        });
      } else {
        // Increment unread count for other channels
        this.updateState({
          unreadCount: this.state.unreadCount + 1
        });
      }
    });

    this.gateway.on('messageUpdate', (message: DiscordMessage) => {
      // Update existing message if it's in the selected channel
      if (message.channel_id === this.state.selectedChannel?.id) {
        this.updateState({
          messages: this.state.messages.map(msg => 
            msg.id === message.id ? message : msg
          )
        });
      }
    });

    this.gateway.on('messageDelete', (data: { id: string; channel_id: string }) => {
      // Remove message if it's from the selected channel
      if (data.channel_id === this.state.selectedChannel?.id) {
        this.updateState({
          messages: this.state.messages.filter(msg => msg.id !== data.id)
        });
      }
    });

    this.gateway.on('guildUpdate', (guild: DiscordGuild) => {
      // Update guild in the list
      this.updateState({
        guilds: this.state.guilds.map(g => g.id === guild.id ? guild : g)
      });
    });

    this.gateway.on('channelUpdate', (channel: DiscordChannel) => {
      // Update channel in the list
      this.updateState({
        channels: this.state.channels.map(ch => ch.id === channel.id ? channel : ch)
      });
    });

    this.gateway.on('error', (error: any) => {
      console.error('[Discord Client] Gateway error:', error);
      this.updateState({ error: 'Connection error occurred' });
    });

    this.gateway.on('disconnected', (code: number) => {
      console.log('[Discord Client] Disconnected with code:', code);
      this.updateState({ 
        isConnected: false,
        error: code === 1000 ? null : 'Connection lost'
      });
    });
  }
}

// Global client instance
export const discordClient = new DiscordClient();