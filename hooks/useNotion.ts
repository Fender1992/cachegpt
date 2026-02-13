'use client';

import { useEffect, useCallback } from 'react';
import { useNotionContext } from '@/contexts/NotionContext';

export interface UseNotionOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useNotion(options: UseNotionOptions = {}) {
  const notion = useNotionContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !notion.isConnected && !notion.isConnecting && !notion.error) {
      notion.connect().catch(console.error);
    }
  }, [autoConnect, notion.isConnected, notion.isConnecting, notion.error]);

  useEffect(() => {
    if (notion.isConnected && onConnect) {
      onConnect();
    }
  }, [notion.isConnected, onConnect]);

  useEffect(() => {
    if (!notion.isConnected && !notion.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [notion.isConnected, notion.isConnecting, onDisconnect]);

  useEffect(() => {
    if (notion.error && onError) {
      onError(notion.error);
    }
  }, [notion.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await notion.connect();
      return true;
    } catch (error) {
      console.error('[useNotion] Connection failed:', error);
      return false;
    }
  }, [notion.connect]);

  const selectPageSafely = useCallback(async (pageId: string): Promise<boolean> => {
    try {
      await notion.selectPage(pageId);
      return true;
    } catch (error) {
      console.error('[useNotion] Page selection failed:', error);
      return false;
    }
  }, [notion.selectPage]);

  const searchSafely = useCallback(async (query: string): Promise<boolean> => {
    try {
      await notion.search(query);
      return true;
    } catch (error) {
      console.error('[useNotion] Search failed:', error);
      return false;
    }
  }, [notion.search]);

  const isReady = notion.isConnected && !notion.isConnecting;

  return {
    // Connection state
    isConnected: notion.isConnected,
    isConnecting: notion.isConnecting,
    error: notion.error,
    workspaceName: notion.workspaceName,
    workspaceIcon: notion.workspaceIcon,

    // Page state
    pages: notion.pages,
    selectedPage: notion.selectedPage,
    pageCount: notion.pageCount,
    hasMore: notion.hasMore,

    // UI state
    isPanelOpen: notion.isPanelOpen,

    // Connection methods
    connect: connectSafely,
    disconnect: notion.disconnect,

    // Navigation methods
    selectPage: selectPageSafely,
    clearSelectedPage: notion.clearSelectedPage,
    loadMorePages: notion.loadMorePages,
    search: searchSafely,

    // UI methods
    openPanel: notion.openPanel,
    closePanel: notion.closePanel,

    // Helper properties
    isReady,

    // Raw notion context
    raw: notion,
  };
}

export default useNotion;
