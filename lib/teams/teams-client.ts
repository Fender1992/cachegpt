/**
 * Teams Client Wrapper
 * Routes all Teams API calls through our backend proxy.
 *
 * Caching strategy:
 * - Channels: cached with 5min TTL
 * - Messages per channel: cached, refreshed on channel select
 */

import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

export interface TeamsChannel {
  id: string;
  name: string;
  description: string;
  teamId: string;
  teamName: string;
  membershipType: string;
}

export interface TeamsMessage {
  id: string;
  text: string;
  contentType: string;
  userId: string;
  userName: string;
  createdDateTime: string;
  replyCount: number;
}

export interface TeamsState {
  isConnected: boolean;
  isConnecting: boolean;
  organizationName: string | null;
  userName: string | null;
  channels: TeamsChannel[];
  selectedChannel: TeamsChannel | null;
  messages: TeamsMessage[];
  selectedMessage: TeamsMessage | null;
  unreadCount: number;
  nextLink: string | null;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CHANNEL_CACHE_TTL = 5 * 60_000; // 5 minutes

export class TeamsClient {
  private connected = false;
  private listeners: Set<(state: TeamsState) => void> = new Set();
  private state: TeamsState = {
    isConnected: false,
    isConnecting: false,
    organizationName: null,
    userName: null,
    channels: [],
    selectedChannel: null,
    messages: [],
    selectedMessage: null,
    unreadCount: 0,
    nextLink: null,
    error: null,
  };

  // Caches
  private channelCache: CacheEntry<TeamsChannel[]> | null = null;
  private messageCache = new Map<string, TeamsMessage[]>(); // channelId -> messages

  subscribe(listener: (state: TeamsState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<TeamsState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): TeamsState {
    return this.state;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) return;

    try {
      this.updateState({ isConnecting: true, error: null });

      const headers = await this.getAuthHeader();
      const statusRes = await apiFetch('/api/integrations/teams', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Teams status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Teams not connected. Please link your Microsoft Teams in Settings.');
      }

      this.connected = true;

      // Fetch channels
      const channelsRes = await apiFetch('/api/integrations/teams/channels', { headers });
      const channelsData = channelsRes.ok ? await channelsRes.json() : { channels: [] };
      const channels: TeamsChannel[] = channelsData.channels || [];

      // Cache channels
      this.channelCache = { data: channels, fetchedAt: Date.now() };

      this.updateState({
        isConnected: true,
        isConnecting: false,
        organizationName: status.organizationName,
        userName: status.userName,
        channels,
        unreadCount: 0,
        error: null,
      });
    } catch (error) {
      // Silently handle "not connected" - this is expected when Teams isn't linked
      const msg = error instanceof Error ? error.message : '';
      if (!msg.includes('not connected')) {
        console.error('[Teams Client] Connection error:', error);
      }
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Teams',
      });
    }
  }

  disconnect(): void {
    this.connected = false;
    this.channelCache = null;
    this.messageCache.clear();

    this.updateState({
      isConnected: false,
      isConnecting: false,
      organizationName: null,
      userName: null,
      channels: [],
      selectedChannel: null,
      messages: [],
      selectedMessage: null,
      unreadCount: 0,
      nextLink: null,
    });
  }

  async selectChannel(channel: TeamsChannel): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({
        selectedChannel: channel,
        selectedMessage: null,
        messages: [],
        nextLink: null,
        error: null,
      });

      // Check message cache
      const cacheKey = `${channel.teamId}:${channel.id}`;
      const cached = this.messageCache.get(cacheKey);
      if (cached) {
        this.updateState({ messages: cached });
      }

      // Always fetch fresh messages
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/teams/messages?teamId=${channel.teamId}&channelId=${channel.id}&top=25`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const data = await res.json();
      const messages: TeamsMessage[] = data.messages || [];

      this.messageCache.set(cacheKey, messages);
      this.updateState({
        messages,
        nextLink: data.nextLink,
      });
    } catch (error) {
      console.error('[Teams Client] Error selecting channel:', error);
      this.updateState({ error: 'Failed to load messages' });
    }
  }

  async loadMoreMessages(): Promise<void> {
    if (!this.connected || !this.state.selectedChannel || !this.state.nextLink) return;

    try {
      const headers = await this.getAuthHeader();
      const channel = this.state.selectedChannel;
      const res = await apiFetch(
        `/api/integrations/teams/messages?teamId=${channel.teamId}&channelId=${channel.id}&top=25`,
        { headers }
      );

      if (!res.ok) return;

      const data = await res.json();
      const newMessages: TeamsMessage[] = data.messages || [];
      const merged = [...this.state.messages, ...newMessages];

      if (this.state.selectedChannel) {
        const cacheKey = `${this.state.selectedChannel.teamId}:${this.state.selectedChannel.id}`;
        this.messageCache.set(cacheKey, merged);
      }

      this.updateState({
        messages: merged,
        nextLink: data.nextLink,
      });
    } catch (error) {
      console.error('[Teams Client] Error loading more messages:', error);
    }
  }

  async sendMessage(teamId: string, channelId: string, text: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Teams not connected');
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await apiFetch('/api/integrations/teams/messages', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, channelId, text }),
      });

      if (!res.ok) {
        throw new Error(`Failed to send message: ${res.status}`);
      }
    } catch (error) {
      console.error('[Teams Client] Error sending message:', error);
      throw error;
    }
  }

  selectMessage(message: TeamsMessage): void {
    this.updateState({ selectedMessage: message });
  }

  clearSelectedMessage(): void {
    this.updateState({ selectedMessage: null });
  }

  clearUnreadCount(): void {
    this.updateState({ unreadCount: 0 });
  }
}

// Global client instance
export const teamsClient = new TeamsClient();
