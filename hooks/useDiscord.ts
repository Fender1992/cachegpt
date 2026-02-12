'use client';

import { useEffect, useCallback } from 'react';
import { useDiscord as useDiscordContext } from '@/contexts/DiscordContext';
import { DiscordGuild, DiscordChannel } from '@/lib/discord/discord-gateway';

export interface UseDiscordOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  onNewMessage?: () => void;
}

export function useDiscord(options: UseDiscordOptions = {}) {
  const discord = useDiscordContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
    onNewMessage,
  } = options;

  // Handle connection lifecycle
  useEffect(() => {
    if (autoConnect && !discord.isConnected && !discord.isConnecting && !discord.error) {
      discord.connect().catch(console.error);
    }
  }, [autoConnect, discord.isConnected, discord.isConnecting, discord.error]);

  // Handle connection events
  useEffect(() => {
    if (discord.isConnected && onConnect) {
      onConnect();
    }
  }, [discord.isConnected, onConnect]);

  useEffect(() => {
    if (!discord.isConnected && !discord.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [discord.isConnected, discord.isConnecting, onDisconnect]);

  useEffect(() => {
    if (discord.error && onError) {
      onError(discord.error);
    }
  }, [discord.error, onError]);

  // Handle new message notifications
  const prevMessageCount = discord.messages.length;
  useEffect(() => {
    if (discord.messages.length > prevMessageCount && onNewMessage) {
      onNewMessage();
    }
  }, [discord.messages.length, prevMessageCount, onNewMessage]);

  // Enhanced connection method with error handling
  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await discord.connect();
      return true;
    } catch (error) {
      console.error('[useDiscord] Connection failed:', error);
      return false;
    }
  }, [discord.connect]);

  // Enhanced guild selection with error handling
  const selectGuildSafely = useCallback(async (guild: DiscordGuild): Promise<boolean> => {
    try {
      await discord.selectGuild(guild);
      return true;
    } catch (error) {
      console.error('[useDiscord] Guild selection failed:', error);
      return false;
    }
  }, [discord.selectGuild]);

  // Enhanced channel selection with error handling
  const selectChannelSafely = useCallback(async (channel: DiscordChannel): Promise<boolean> => {
    try {
      await discord.selectChannel(channel);
      return true;
    } catch (error) {
      console.error('[useDiscord] Channel selection failed:', error);
      return false;
    }
  }, [discord.selectChannel]);

  // Enhanced message sending with error handling
  const sendMessageSafely = useCallback(async (content: string): Promise<boolean> => {
    if (!content.trim()) return false;
    
    try {
      await discord.sendMessage(content);
      return true;
    } catch (error) {
      console.error('[useDiscord] Message sending failed:', error);
      return false;
    }
  }, [discord.sendMessage]);

  // Helper methods for common operations
  const isReady = discord.isConnected && !discord.isConnecting;
  const hasUnreadMessages = discord.unreadCount > 0;
  const canSendMessages = isReady && discord.selectedChannel;

  // Get available text channels for current guild
  const textChannels = discord.channels.filter(ch => ch.type === 0);

  // Get display name for current user
  const userDisplayName = discord.user?.global_name || discord.user?.username || 'Unknown User';

  // Format unread count for display
  const formatUnreadCount = (count: number): string => {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  };

  return {
    // Connection state
    isConnected: discord.isConnected,
    isConnecting: discord.isConnecting,
    error: discord.error,
    user: discord.user,
    
    // Guild and channel state
    guilds: discord.guilds,
    selectedGuild: discord.selectedGuild,
    channels: textChannels,
    selectedChannel: discord.selectedChannel,
    
    // Message state
    messages: discord.messages,
    unreadCount: discord.unreadCount,
    
    // UI state
    isPanelOpen: discord.isPanelOpen,
    
    // Connection methods
    connect: connectSafely,
    disconnect: discord.disconnect,
    
    // Navigation methods
    selectGuild: selectGuildSafely,
    selectChannel: selectChannelSafely,
    
    // Message methods
    sendMessage: sendMessageSafely,
    clearUnreadCount: discord.clearUnreadCount,
    
    // UI methods
    openPanel: discord.openPanel,
    closePanel: discord.closePanel,
    
    // Helper properties
    isReady,
    hasUnreadMessages,
    canSendMessages,
    userDisplayName,
    formatUnreadCount,
    
    // Raw discord context (for advanced usage)
    raw: discord,
  };
}

export default useDiscord;