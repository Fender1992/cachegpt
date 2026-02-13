/**
 * Yahoo Mail Client Wrapper
 * Routes all Yahoo API calls through our backend proxy.
 *
 * Caching strategy:
 * - Labels: cached with 5min TTL
 * - Messages per label: cached, refreshed on label select
 */

import { supabase } from '@/lib/supabase-client';

export interface YahooLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal: number;
  messagesUnread: number;
}

export interface YahooMessageSummary {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  subject: string;
  date: string;
  isUnread: boolean;
}

export interface YahooMessageFull {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  inReplyTo: string;
  body: string;
}

export interface YahooState {
  isConnected: boolean;
  isConnecting: boolean;
  email: string | null;
  labels: YahooLabel[];
  selectedLabel: YahooLabel | null;
  messages: YahooMessageSummary[];
  selectedMessage: YahooMessageFull | null;
  unreadCount: number;
  nextPageToken: string | null;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const LABEL_CACHE_TTL = 5 * 60_000; // 5 minutes

export class YahooClient {
  private connected = false;
  private listeners: Set<(state: YahooState) => void> = new Set();
  private state: YahooState = {
    isConnected: false,
    isConnecting: false,
    email: null,
    labels: [],
    selectedLabel: null,
    messages: [],
    selectedMessage: null,
    unreadCount: 0,
    nextPageToken: null,
    error: null,
  };

  // Caches
  private labelCache: CacheEntry<YahooLabel[]> | null = null;
  private messageCache = new Map<string, YahooMessageSummary[]>(); // labelId -> messages

  subscribe(listener: (state: YahooState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<YahooState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): YahooState {
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
      const statusRes = await fetch('/api/integrations/yahoo', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Yahoo status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Yahoo not connected. Please link your Yahoo account in Settings.');
      }

      console.log('[Yahoo Client] Connected as', status.email);

      this.connected = true;

      // Calculate unread from labels if we have them cached
      let unreadCount = 0;

      // Fetch labels
      const labelsRes = await fetch('/api/integrations/yahoo/labels', { headers });
      const labels: YahooLabel[] = labelsRes.ok ? await labelsRes.json() : [];

      // Cache labels
      this.labelCache = { data: labels, fetchedAt: Date.now() };

      // Get inbox unread count
      const inbox = labels.find(l => l.id === 'INBOX');
      if (inbox) {
        unreadCount = inbox.messagesUnread;
      }

      this.updateState({
        isConnected: true,
        isConnecting: false,
        email: status.email,
        labels,
        unreadCount,
        error: null,
      });
    } catch (error) {
      console.error('[Yahoo Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Yahoo',
      });
    }
  }

  disconnect(): void {
    this.connected = false;
    this.labelCache = null;
    this.messageCache.clear();

    this.updateState({
      isConnected: false,
      isConnecting: false,
      email: null,
      labels: [],
      selectedLabel: null,
      messages: [],
      selectedMessage: null,
      unreadCount: 0,
      nextPageToken: null,
    });
  }

  async selectLabel(label: YahooLabel): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({
        selectedLabel: label,
        selectedMessage: null,
        messages: [],
        nextPageToken: null,
        error: null,
      });

      // Check message cache
      const cached = this.messageCache.get(label.id);
      if (cached) {
        this.updateState({ messages: cached });
      }

      // Always fetch fresh messages
      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/yahoo/messages?labelId=${encodeURIComponent(label.id)}&limit=20`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const data = await res.json();
      const messages: YahooMessageSummary[] = data.messages || [];

      this.messageCache.set(label.id, messages);
      this.updateState({
        messages,
        nextPageToken: data.nextPageToken,
      });
    } catch (error) {
      console.error('[Yahoo Client] Error selecting label:', error);
      this.updateState({ error: 'Failed to load messages' });
    }
  }

  async loadMoreMessages(): Promise<void> {
    if (!this.connected || !this.state.selectedLabel || !this.state.nextPageToken) return;

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/yahoo/messages?labelId=${encodeURIComponent(this.state.selectedLabel.id)}&limit=20&pageToken=${this.state.nextPageToken}`,
        { headers }
      );

      if (!res.ok) return;

      const data = await res.json();
      const newMessages: YahooMessageSummary[] = data.messages || [];
      const merged = [...this.state.messages, ...newMessages];

      if (this.state.selectedLabel) {
        this.messageCache.set(this.state.selectedLabel.id, merged);
      }

      this.updateState({
        messages: merged,
        nextPageToken: data.nextPageToken,
      });
    } catch (error) {
      console.error('[Yahoo Client] Error loading more messages:', error);
    }
  }

  async selectMessage(messageId: string): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({ error: null });

      const headers = await this.getAuthHeader();
      const labelId = this.state.selectedLabel?.id || 'INBOX';
      const res = await fetch(
        `/api/integrations/yahoo/messages?messageId=${messageId}&labelId=${encodeURIComponent(labelId)}`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load message: ${res.status}`);
      }

      const message: YahooMessageFull = await res.json();
      this.updateState({ selectedMessage: message });
    } catch (error) {
      console.error('[Yahoo Client] Error loading message:', error);
      this.updateState({ error: 'Failed to load message' });
    }
  }

  async sendEmail(to: string, subject: string, body: string, threadId?: string, inReplyTo?: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Yahoo not connected');
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/integrations/yahoo/send', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, threadId, inReplyTo }),
      });

      if (!res.ok) {
        throw new Error(`Failed to send email: ${res.status}`);
      }
    } catch (error) {
      console.error('[Yahoo Client] Error sending email:', error);
      throw error;
    }
  }

  clearSelectedMessage(): void {
    this.updateState({ selectedMessage: null });
  }

  clearUnreadCount(): void {
    this.updateState({ unreadCount: 0 });
  }
}

// Global client instance
export const yahooClient = new YahooClient();
