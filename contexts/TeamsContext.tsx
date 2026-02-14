'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { teamsClient, TeamsState, TeamsChannel, TeamsMessage } from '@/lib/teams/teams-client';
import { panelManager } from '@/lib/panel-manager';

interface TeamsContextValue extends TeamsState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectChannel: (channel: TeamsChannel) => Promise<void>;
  selectMessage: (message: TeamsMessage) => void;
  clearSelectedMessage: () => void;
  loadMoreMessages: () => Promise<void>;

  // Interaction methods
  sendMessage: (teamId: string, channelId: string, text: string) => Promise<void>;
  clearUnreadCount: () => void;

  // UI state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const TeamsContext = createContext<TeamsContextValue | null>(null);

interface TeamsProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function TeamsProvider({ children, autoConnect = false }: TeamsProviderProps) {
  const [state, setState] = useState<TeamsState>(teamsClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = teamsClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      teamsClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return teamsClient.connect();
  };

  const disconnect = (): void => {
    teamsClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectChannel = async (channel: TeamsChannel): Promise<void> => {
    return teamsClient.selectChannel(channel);
  };

  const selectMessage = (message: TeamsMessage): void => {
    teamsClient.selectMessage(message);
  };

  const clearSelectedMessage = (): void => {
    teamsClient.clearSelectedMessage();
  };

  const loadMoreMessages = async (): Promise<void> => {
    return teamsClient.loadMoreMessages();
  };

  const sendMessage = async (teamId: string, channelId: string, text: string): Promise<void> => {
    return teamsClient.sendMessage(teamId, channelId, text);
  };

  const clearUnreadCount = (): void => {
    teamsClient.clearUnreadCount();
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  // Register with panel manager
  useEffect(() => {
    panelManager.register('teams', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('teams');
    setIsPanelOpen(true);
    clearUnreadCount();
  };

  const contextValue: TeamsContextValue = {
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
    <TeamsContext.Provider value={contextValue}>
      {children}
    </TeamsContext.Provider>
  );
}

export function useTeamsContext(): TeamsContextValue {
  const context = useContext(TeamsContext);
  if (!context) {
    throw new Error('useTeamsContext must be used within a TeamsProvider');
  }
  return context;
}

export default TeamsContext;
