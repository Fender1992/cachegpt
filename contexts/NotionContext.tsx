'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { notionClient, NotionState, NotionPageContent } from '@/lib/notion/notion-client';
import { panelManager } from '@/lib/panel-manager';

interface NotionContextValue extends NotionState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectPage: (pageId: string) => Promise<void>;
  clearSelectedPage: () => void;
  loadMorePages: () => Promise<void>;
  search: (query: string) => Promise<void>;

  // UI state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const NotionContext = createContext<NotionContextValue | null>(null);

interface NotionProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function NotionProvider({ children, autoConnect = false }: NotionProviderProps) {
  const [state, setState] = useState<NotionState>(notionClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = notionClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      notionClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return notionClient.connect();
  };

  const disconnect = (): void => {
    notionClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectPage = async (pageId: string): Promise<void> => {
    return notionClient.selectPage(pageId);
  };

  const clearSelectedPage = (): void => {
    notionClient.clearSelectedPage();
  };

  const loadMorePages = async (): Promise<void> => {
    return notionClient.loadMorePages();
  };

  const searchNotion = async (query: string): Promise<void> => {
    return notionClient.search(query);
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  // Register with panel manager
  useEffect(() => {
    panelManager.register('notion', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('notion'); // Close other panels
    setIsPanelOpen(true);
  };

  const contextValue: NotionContextValue = {
    ...state,
    connect,
    disconnect,
    selectPage,
    clearSelectedPage,
    loadMorePages,
    search: searchNotion,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <NotionContext.Provider value={contextValue}>
      {children}
    </NotionContext.Provider>
  );
}

export function useNotionContext(): NotionContextValue {
  const context = useContext(NotionContext);
  if (!context) {
    throw new Error('useNotionContext must be used within a NotionProvider');
  }
  return context;
}

export default NotionContext;
