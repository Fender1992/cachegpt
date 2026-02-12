'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { discordClient, DiscordState } from '@/lib/discord/discord-client';
import { DiscordGuild, DiscordChannel } from '@/lib/discord/discord-gateway';

interface DiscordContextValue extends DiscordState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectGuild: (guild: DiscordGuild) => Promise<void>;
  selectChannel: (channel: DiscordChannel) => Promise<void>;

  // Interaction methods
  sendMessage: (content: string) => Promise<void>;
  clearUnreadCount: () => void;

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
      discordClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting]);

  // Connection methods
  const connect = async (): Promise<void> => {
    return discordClient.connect();
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

  const getInviteUrl = (guildId: string): string => {
    return discordClient.getInviteUrl(guildId);
  };

  // UI state methods
  const openPanel = (): void => {
    setIsPanelOpen(true);
    clearUnreadCount(); // Clear unread count when opening panel
  };

  const closePanel = (): void => {
    setIsPanelOpen(false);
  };

  const contextValue: DiscordContextValue = {
    ...state,
    connect,
    disconnect,
    selectGuild,
    selectChannel,
    sendMessage,
    clearUnreadCount,
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