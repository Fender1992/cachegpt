/**
 * Gmail Client Wrapper
 * Routes all Gmail API calls through our backend proxy.
 *
 * Caching strategy:
 * - Labels: cached with 5min TTL
 * - Messages per label: cached, refreshed on label select
 */

import { supabase } from '@/lib/supabase-client';

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal: number;
  messagesUnread: number;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  subject: string;
  date: string;
  isUnread: boolean;
}

export interface GmailMessageFull {
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

export interface GmailState {
  isConnected: boolean;
  isConnecting: boolean;
  email: string | null;
  labels: GmailLabel[];
  selectedLabel: GmailLabel | null;
  messages: GmailMessageSummary[];
  selectedMessage: GmailMessageFull | null;
  unreadCount: number;
  nextPageToken: string | null;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const LABEL_CACHE_TTL = 5 * 60_000; // 5 minutes

export class GmailClient {
  private connected = false;
  private listeners: Set<(state: GmailState) => void> = new Set();
  private state: GmailState = {
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
  private labelCache: CacheEntry<GmailLabel[]> | null = null;
  private messageCache = new Map<string, GmailMessageSummary[]>(); // labelId -> messages

  subscribe(listener: (state: GmailState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<GmailState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): GmailState {
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
      const statusRes = await fetch('/api/integrations/gmail', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Gmail status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Gmail not connected. Please link your Gmail account in Settings.');
      }

      console.log('[Gmail Client] Connected as', status.email);

      this.connected = true;

      // Calculate unread from labels if we have them cached
      let unreadCount = 0;

      // Fetch labels
      const labelsRes = await fetch('/api/integrations/gmail/labels', { headers });
      const labels: GmailLabel[] = labelsRes.ok ? await labelsRes.json() : [];

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
      console.error('[Gmail Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Gmail',
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

  async selectLabel(label: GmailLabel): Promise<void> {
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
        `/api/integrations/gmail/messages?labelId=${label.id}&limit=20`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const data = await res.json();
      const messages: GmailMessageSummary[] = data.messages || [];

      this.messageCache.set(label.id, messages);
      this.updateState({
        messages,
        nextPageToken: data.nextPageToken,
      });
    } catch (error) {
      console.error('[Gmail Client] Error selecting label:', error);
      this.updateState({ error: 'Failed to load messages' });
    }
  }

  async loadMoreMessages(): Promise<void> {
    if (!this.connected || !this.state.selectedLabel || !this.state.nextPageToken) return;

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/gmail/messages?labelId=${this.state.selectedLabel.id}&limit=20&pageToken=${this.state.nextPageToken}`,
        { headers }
      );

      if (!res.ok) return;

      const data = await res.json();
      const newMessages: GmailMessageSummary[] = data.messages || [];
      const merged = [...this.state.messages, ...newMessages];

      if (this.state.selectedLabel) {
        this.messageCache.set(this.state.selectedLabel.id, merged);
      }

      this.updateState({
        messages: merged,
        nextPageToken: data.nextPageToken,
      });
    } catch (error) {
      console.error('[Gmail Client] Error loading more messages:', error);
    }
  }

  async selectMessage(messageId: string): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({ error: null });

      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/gmail/messages?messageId=${messageId}`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load message: ${res.status}`);
      }

      const message: GmailMessageFull = await res.json();
      this.updateState({ selectedMessage: message });

      // Mark as read in Gmail if the message was unread
      const wasUnread = this.state.messages.some(m => m.id === messageId && m.isUnread);
      if (wasUnread) {
        // Update local state immediately for responsiveness
        const updatedMessages = this.state.messages.map(m =>
          m.id === messageId ? { ...m, isUnread: false } : m
        );
        if (this.state.selectedLabel) {
          this.messageCache.set(this.state.selectedLabel.id, updatedMessages);
        }
        this.updateState({
          messages: updatedMessages,
          unreadCount: Math.max(0, this.state.unreadCount - 1),
        });

        // Fire-and-forget the API call to mark as read in Gmail
        fetch('/api/integrations/gmail/messages', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId }),
        }).catch(err => console.error('[Gmail Client] Failed to mark as read:', err));
      }
    } catch (error) {
      console.error('[Gmail Client] Error loading message:', error);
      this.updateState({ error: 'Failed to load message' });
    }
  }

  async sendEmail(to: string, subject: string, body: string, threadId?: string, inReplyTo?: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Gmail not connected');
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/integrations/gmail/send', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, threadId, inReplyTo }),
      });

      if (!res.ok) {
        throw new Error(`Failed to send email: ${res.status}`);
      }
    } catch (error) {
      console.error('[Gmail Client] Error sending email:', error);
      throw error;
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Gmail not connected');
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/gmail/messages?messageId=${messageId}`,
        {
          method: 'DELETE',
          headers,
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to delete message: ${res.status}`);
      }

      // Remove from local message list
      const updatedMessages = this.state.messages.filter(m => m.id !== messageId);
      if (this.state.selectedLabel) {
        this.messageCache.set(this.state.selectedLabel.id, updatedMessages);
      }

      // Clear selected message if it was the deleted one
      const clearSelected = this.state.selectedMessage?.id === messageId;

      this.updateState({
        messages: updatedMessages,
        ...(clearSelected ? { selectedMessage: null } : {}),
      });
    } catch (error) {
      console.error('[Gmail Client] Error deleting message:', error);
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
export const gmailClient = new GmailClient();
