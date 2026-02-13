'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { slackClient, SlackState, SlackChannel, SlackMessage } from '@/lib/slack/slack-client';
import { panelManager } from '@/lib/panel-manager';

interface SlackContextValue extends SlackState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectChannel: (channel: SlackChannel) => Promise<void>;
  selectMessage: (message: SlackMessage) => void;
  clearSelectedMessage: () => void;
  loadMoreMessages: () => Promise<void>;

  // Interaction methods
  sendMessage: (channelId: string, text: string, threadTs?: string) => Promise<void>;
  clearUnreadCount: () => void;

  // UI state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const SlackContext = createContext<SlackContextValue | null>(null);

interface SlackProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function SlackProvider({ children, autoConnect = false }: SlackProviderProps) {
  const [state, setState] = useState<SlackState>(slackClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = slackClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      slackClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return slackClient.connect();
  };

  const disconnect = (): void => {
    slackClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectChannel = async (channel: SlackChannel): Promise<void> => {
    return slackClient.selectChannel(channel);
  };

  const selectMessage = (message: SlackMessage): void => {
    slackClient.selectMessage(message);
  };

  const clearSelectedMessage = (): void => {
    slackClient.clearSelectedMessage();
  };

  const loadMoreMessages = async (): Promise<void> => {
    return slackClient.loadMoreMessages();
  };

  const sendMessage = async (channelId: string, text: string, threadTs?: string): Promise<void> => {
    return slackClient.sendMessage(channelId, text, threadTs);
  };

  const clearUnreadCount = (): void => {
    slackClient.clearUnreadCount();
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  // Register with panel manager
  useEffect(() => {
    panelManager.register('slack', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('slack'); // Close other panels
    setIsPanelOpen(true);
    clearUnreadCount();
  };

  const contextValue: SlackContextValue = {
    ...state,
    connect,
    disconnect,
    selectChannel,
    selectMessage,
    clearSelectedMessage,
    loadMoreMessages,
    sendMessage,
    clearUnreadCount,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <SlackContext.Provider value={contextValue}>
      {children}
    </SlackContext.Provider>
  );
}

export function useSlackContext(): SlackContextValue {
  const context = useContext(SlackContext);
  if (!context) {
    throw new Error('useSlackContext must be used within a SlackProvider');
  }
  return context;
}

export default SlackContext;
