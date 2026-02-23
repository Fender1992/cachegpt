/**
 * Notion Client Wrapper
 * Routes all Notion API calls through our backend proxy.
 *
 * Caching strategy:
 * - Pages list: cached with 5min TTL
 * - Page content: cached per pageId
 */

import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

export interface NotionPage {
  id: string;
  type: 'page' | 'database';
  title: string;
  icon: string | null;
  lastEditedTime: string;
  url: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  content: string;
  hasChildren: boolean;
}

export interface NotionPageContent {
  page: {
    id: string;
    title: string;
    icon: string | null;
    cover: string | null;
    lastEditedTime: string;
    createdTime: string;
    url: string;
  };
  blocks: NotionBlock[];
}

export interface NotionState {
  isConnected: boolean;
  isConnecting: boolean;
  workspaceName: string | null;
  workspaceIcon: string | null;
  pages: NotionPage[];
  selectedPage: NotionPageContent | null;
  pageCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const PAGE_CACHE_TTL = 5 * 60_000; // 5 minutes

export class NotionClient {
  private connected = false;
  private listeners: Set<(state: NotionState) => void> = new Set();
  private state: NotionState = {
    isConnected: false,
    isConnecting: false,
    workspaceName: null,
    workspaceIcon: null,
    pages: [],
    selectedPage: null,
    pageCount: 0,
    nextCursor: null,
    hasMore: false,
    error: null,
  };

  // Caches
  private pageListCache: CacheEntry<NotionPage[]> | null = null;
  private pageContentCache = new Map<string, NotionPageContent>();

  subscribe(listener: (state: NotionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<NotionState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): NotionState {
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
      const statusRes = await apiFetch('/api/integrations/notion', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Notion status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Notion not connected. Please link your Notion workspace in Settings.');
      }

      this.connected = true;

      // Fetch pages
      const pagesRes = await apiFetch('/api/integrations/notion/pages?pageSize=20', { headers });
      const pagesData = pagesRes.ok ? await pagesRes.json() : { items: [], nextCursor: null, hasMore: false };
      const pages: NotionPage[] = pagesData.items || [];

      // Cache pages
      this.pageListCache = { data: pages, fetchedAt: Date.now() };

      this.updateState({
        isConnected: true,
        isConnecting: false,
        workspaceName: status.workspaceName,
        workspaceIcon: status.workspaceIcon,
        pages,
        pageCount: status.pageCount,
        nextCursor: pagesData.nextCursor,
        hasMore: pagesData.hasMore,
        error: null,
      });
    } catch (error) {
      console.error('[Notion Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Notion',
      });
    }
  }

  disconnect(): void {
    this.connected = false;
    this.pageListCache = null;
    this.pageContentCache.clear();

    this.updateState({
      isConnected: false,
      isConnecting: false,
      workspaceName: null,
      workspaceIcon: null,
      pages: [],
      selectedPage: null,
      pageCount: 0,
      nextCursor: null,
      hasMore: false,
    });
  }

  async selectPage(pageId: string): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({ error: null });

      // Check cache
      const cached = this.pageContentCache.get(pageId);
      if (cached) {
        this.updateState({ selectedPage: cached });
      }

      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/notion/pages?pageId=${pageId}`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load page: ${res.status}`);
      }

      const data: NotionPageContent = await res.json();
      this.pageContentCache.set(pageId, data);
      this.updateState({ selectedPage: data });
    } catch (error) {
      console.error('[Notion Client] Error loading page:', error);
      this.updateState({ error: 'Failed to load page' });
    }
  }

  async loadMorePages(): Promise<void> {
    if (!this.connected || !this.state.nextCursor) return;

    try {
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/notion/pages?pageSize=20&cursor=${this.state.nextCursor}`,
        { headers }
      );

      if (!res.ok) return;

      const data = await res.json();
      const newPages: NotionPage[] = data.items || [];
      const merged = [...this.state.pages, ...newPages];

      this.pageListCache = { data: merged, fetchedAt: Date.now() };
      this.updateState({
        pages: merged,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
      });
    } catch (error) {
      console.error('[Notion Client] Error loading more pages:', error);
    }
  }

  async search(query: string): Promise<void> {
    if (!this.connected || !query.trim()) return;

    try {
      this.updateState({ error: null });

      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/notion/search?q=${encodeURIComponent(query)}&pageSize=20`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Search failed: ${res.status}`);
      }

      const data = await res.json();
      this.updateState({
        pages: data.results || [],
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
      });
    } catch (error) {
      console.error('[Notion Client] Search error:', error);
      this.updateState({ error: 'Search failed' });
    }
  }

  clearSelectedPage(): void {
    this.updateState({ selectedPage: null });
  }
}

// Global client instance
export const notionClient = new NotionClient();
