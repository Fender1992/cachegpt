'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { discordClient, DiscordState } from '@/lib/discord/discord-client';
import { DiscordGuild, DiscordChannel } from '@/lib/discord/discord-gateway';
import { panelManager } from '@/lib/panel-manager';

interface DiscordContextValue extends DiscordState {
  // Connection methods
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectGuild: (guild: DiscordGuild) => Promise<void>;
  selectChannel: (channel: DiscordChannel) => Promise<void>;

  // Interaction methods
  sendMessage: (content: string) => Promise<void>;
  clearUnreadCount: () => void;

  // Pagination
  loadOlderMessages: () => Promise<void>;

  // Bot invite
  getInviteUrl: (guildId: string) => string;

  // UI state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const DiscordContext = createContext<DiscordContextValue | null>(null);

interface DiscordProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function DiscordProvider({ children, autoConnect = false }: DiscordProviderProps) {
  const [state, setState] = useState<DiscordState>(discordClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = discordClient.subscribe(setState);

    // Auto-connect if requested
    if (autoConnect && !state.isConnected && !state.isConnecting) {
      // If there's an error, the client's internal reconnect timer handles retries.
      // Only trigger connect on initial mount (no error yet).
      if (!state.error) {
        discordClient.connect().catch(console.error);
      }
    }

    return unsubscribe;
  }, [autoConnect]);

  // Reconnect when tab becomes visible again (handles sleep/background scenarios)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoConnect) {
        const currentState = discordClient.getState();
        if (currentState.error && !currentState.isConnecting) {
          console.log('[Discord Context] Tab visible, retrying connection');
          discordClient.reconnect().catch(console.error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoConnect]);

  // Connection methods
  const connect = async (): Promise<void> => {
    return discordClient.connect();
  };

  const reconnect = async (): Promise<void> => {
    return discordClient.reconnect();
  };

  const disconnect = (): void => {
    discordClient.disconnect();
    setIsPanelOpen(false); // Close panel on disconnect
  };

  // Navigation methods
  const selectGuild = async (guild: DiscordGuild): Promise<void> => {
    return discordClient.selectGuild(guild);
  };

  const selectChannel = async (channel: DiscordChannel): Promise<void> => {
    return discordClient.selectChannel(channel);
  };

  // Interaction methods
  const sendMessage = async (content: string): Promise<void> => {
    return discordClient.sendMessage(content);
  };

  const clearUnreadCount = (): void => {
    discordClient.clearUnreadCount();
  };

  const loadOlderMessages = async (): Promise<void> => {
    return discordClient.loadOlderMessages();
  };

  const getInviteUrl = (guildId: string): string => {
    return discordClient.getInviteUrl(guildId);
  };

  // UI state methods
  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  // Register with panel manager
  useEffect(() => {
    panelManager.register('discord', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('discord'); // Close other panels
    setIsPanelOpen(true);
    clearUnreadCount();
  };

  const contextValue: DiscordContextValue = {
    ...state,
    connect,
    reconnect,
    disconnect,
    selectGuild,
    selectChannel,
    sendMessage,
    clearUnreadCount,
    loadOlderMessages,
    getInviteUrl,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <DiscordContext.Provider value={contextValue}>
      {children}
    </DiscordContext.Provider>
  );
}

export function useDiscord(): DiscordContextValue {
  const context = useContext(DiscordContext);
  if (!context) {
    throw new Error('useDiscord must be used within a DiscordProvider');
  }
  return context;
}

export default DiscordContext;