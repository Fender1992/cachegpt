/**
 * Slack Client Wrapper
 * Routes all Slack API calls through our backend proxy.
 *
 * Caching strategy:
 * - Channels: cached with 5min TTL
 * - Messages per channel: cached, refreshed on channel select
 */

import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  topic: string;
  purpose: string;
  memberCount: number;
  unreadCount: number;
}

export interface SlackMessage {
  ts: string;
  text: string;
  userId: string;
  userName: string;
  threadTs?: string;
  replyCount: number;
  timestamp: string;
}

export interface SlackState {
  isConnected: boolean;
  isConnecting: boolean;
  teamName: string | null;
  userName: string | null;
  channels: SlackChannel[];
  selectedChannel: SlackChannel | null;
  messages: SlackMessage[];
  selectedMessage: SlackMessage | null;
  unreadCount: number;
  nextCursor: string | null;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CHANNEL_CACHE_TTL = 5 * 60_000; // 5 minutes

export class SlackClient {
  private connected = false;
  private listeners: Set<(state: SlackState) => void> = new Set();
  private state: SlackState = {
    isConnected: false,
    isConnecting: false,
    teamName: null,
    userName: null,
    channels: [],
    selectedChannel: null,
    messages: [],
    selectedMessage: null,
    unreadCount: 0,
    nextCursor: null,
    error: null,
  };

  // Caches
  private channelCache: CacheEntry<SlackChannel[]> | null = null;
  private messageCache = new Map<string, SlackMessage[]>(); // channelId -> messages

  subscribe(listener: (state: SlackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<SlackState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): SlackState {
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
      const statusRes = await apiFetch('/api/integrations/slack', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Slack status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Slack not connected. Please link your Slack workspace in Settings.');
      }

      this.connected = true;

      // Fetch channels
      const channelsRes = await apiFetch('/api/integrations/slack/channels', { headers });
      const channelsData = channelsRes.ok ? await channelsRes.json() : { channels: [] };
      const channels: SlackChannel[] = channelsData.channels || [];

      // Cache channels
      this.channelCache = { data: channels, fetchedAt: Date.now() };

      // Calculate total unread
      const unreadCount = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

      this.updateState({
        isConnected: true,
        isConnecting: false,
        teamName: status.teamName,
        userName: status.userName,
        channels,
        unreadCount,
        error: null,
      });
    } catch (error) {
      console.error('[Slack Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Slack',
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
      teamName: null,
      userName: null,
      channels: [],
      selectedChannel: null,
      messages: [],
      selectedMessage: null,
      unreadCount: 0,
      nextCursor: null,
    });
  }

  async selectChannel(channel: SlackChannel): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({
        selectedChannel: channel,
        selectedMessage: null,
        messages: [],
        nextCursor: null,
        error: null,
      });

      // Check message cache
      const cached = this.messageCache.get(channel.id);
      if (cached) {
        this.updateState({ messages: cached });
      }

      // Always fetch fresh messages
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/slack/messages?channelId=${channel.id}&limit=25`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const data = await res.json();
      const messages: SlackMessage[] = data.messages || [];

      this.messageCache.set(channel.id, messages);
      this.updateState({
        messages,
        nextCursor: data.nextCursor,
      });
    } catch (error) {
      console.error('[Slack Client] Error selecting channel:', error);
      this.updateState({ error: 'Failed to load messages' });
    }
  }

  async loadMoreMessages(): Promise<void> {
    if (!this.connected || !this.state.selectedChannel || !this.state.nextCursor) return;

    try {
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/slack/messages?channelId=${this.state.selectedChannel.id}&limit=25&cursor=${this.state.nextCursor}`,
        { headers }
      );

      if (!res.ok) return;

      const data = await res.json();
      const newMessages: SlackMessage[] = data.messages || [];
      const merged = [...this.state.messages, ...newMessages];

      if (this.state.selectedChannel) {
        this.messageCache.set(this.state.selectedChannel.id, merged);
      }

      this.updateState({
        messages: merged,
        nextCursor: data.nextCursor,
      });
    } catch (error) {
      console.error('[Slack Client] Error loading more messages:', error);
    }
  }

  async sendMessage(channelId: string, text: string, threadTs?: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Slack not connected');
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await apiFetch('/api/integrations/slack/messages', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, text, threadTs }),
      });

      if (!res.ok) {
        throw new Error(`Failed to send message: ${res.status}`);
      }
    } catch (error) {
      console.error('[Slack Client] Error sending message:', error);
      throw error;
    }
  }

  selectMessage(message: SlackMessage): void {
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
export const slackClient = new SlackClient();
