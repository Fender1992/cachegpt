'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { yahooClient, YahooState, YahooLabel, YahooMessageFull } from '@/lib/yahoo/yahoo-client';
import { panelManager } from '@/lib/panel-manager';

interface YahooContextValue extends YahooState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectLabel: (label: YahooLabel) => Promise<void>;
  selectMessage: (messageId: string) => Promise<void>;
  clearSelectedMessage: () => void;
  loadMoreMessages: () => Promise<void>;

  // Interaction methods
  sendEmail: (to: string, subject: string, body: string, threadId?: string, inReplyTo?: string) => Promise<void>;
  clearUnreadCount: () => void;

  // UI state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const YahooContext = createContext<YahooContextValue | null>(null);

interface YahooProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function YahooProvider({ children, autoConnect = false }: YahooProviderProps) {
  const [state, setState] = useState<YahooState>(yahooClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = yahooClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      yahooClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return yahooClient.connect();
  };

  const disconnect = (): void => {
    yahooClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectLabel = async (label: YahooLabel): Promise<void> => {
    return yahooClient.selectLabel(label);
  };

  const selectMessage = async (messageId: string): Promise<void> => {
    return yahooClient.selectMessage(messageId);
  };

  const clearSelectedMessage = (): void => {
    yahooClient.clearSelectedMessage();
  };

  const loadMoreMessages = async (): Promise<void> => {
    return yahooClient.loadMoreMessages();
  };

  const sendEmail = async (to: string, subject: string, body: string, threadId?: string, inReplyTo?: string): Promise<void> => {
    return yahooClient.sendEmail(to, subject, body, threadId, inReplyTo);
  };

  const clearUnreadCount = (): void => {
    yahooClient.clearUnreadCount();
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  // Register with panel manager
  useEffect(() => {
    panelManager.register('yahoo', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('yahoo'); // Close other panels
    setIsPanelOpen(true);
    clearUnreadCount();
  };

  const contextValue: YahooContextValue = {
    ...state,
    connect,
    disconnect,
    selectLabel,
    selectMessage,
    clearSelectedMessage,
    loadMoreMessages,
    sendEmail,
    clearUnreadCount,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <YahooContext.Provider value={contextValue}>
      {children}
    </YahooContext.Provider>
  );
}

export function useYahooContext(): YahooContextValue {
  const context = useContext(YahooContext);
  if (!context) {
    throw new Error('useYahooContext must be used within a YahooProvider');
  }
  return context;
}

export default YahooContext;
