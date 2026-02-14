'use client';

import { useEffect, useCallback } from 'react';
import { useTeamsContext } from '@/contexts/TeamsContext';
import { TeamsChannel } from '@/lib/teams/teams-client';

export interface UseTeamsOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useTeams(options: UseTeamsOptions = {}) {
  const teams = useTeamsContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !teams.isConnected && !teams.isConnecting && !teams.error) {
      teams.connect().catch(console.error);
    }
  }, [autoConnect, teams.isConnected, teams.isConnecting, teams.error]);

  useEffect(() => {
    if (teams.isConnected && onConnect) {
      onConnect();
    }
  }, [teams.isConnected, onConnect]);

  useEffect(() => {
    if (!teams.isConnected && !teams.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [teams.isConnected, teams.isConnecting, onDisconnect]);

  useEffect(() => {
    if (teams.error && onError) {
      onError(teams.error);
    }
  }, [teams.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await teams.connect();
      return true;
    } catch (error) {
      console.error('[useTeams] Connection failed:', error);
      return false;
    }
  }, [teams.connect]);

  const selectChannelSafely = useCallback(async (channel: TeamsChannel): Promise<boolean> => {
    try {
      await teams.selectChannel(channel);
      return true;
    } catch (error) {
      console.error('[useTeams] Channel selection failed:', error);
      return false;
    }
  }, [teams.selectChannel]);

  const sendMessageSafely = useCallback(async (
    teamId: string, channelId: string, text: string
  ): Promise<boolean> => {
    try {
      await teams.sendMessage(teamId, channelId, text);
      return true;
    } catch (error) {
      console.error('[useTeams] Message sending failed:', error);
      return false;
    }
  }, [teams.sendMessage]);

  const isReady = teams.isConnected && !teams.isConnecting;
  const hasUnread = teams.unreadCount > 0;

  const formatUnreadCount = (count: number): string => {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  };

  return {
    // Connection state
    isConnected: teams.isConnected,
    isConnecting: teams.isConnecting,
    error: teams.error,
    organizationName: teams.organizationName,
    userName: teams.userName,

    // Channel and message state
    channels: teams.channels,
    selectedChannel: teams.selectedChannel,
    messages: teams.messages,
    selectedMessage: teams.selectedMessage,

    // Counts
    unreadCount: teams.unreadCount,
    nextLink: teams.nextLink,

    // UI state
    isPanelOpen: teams.isPanelOpen,

    // Connection methods
    connect: connectSafely,
    disconnect: teams.disconnect,

    // Navigation methods
    selectChannel: selectChannelSafely,
    selectMessage: teams.selectMessage,
    clearSelectedMessage: teams.clearSelectedMessage,
    loadMoreMessages: teams.loadMoreMessages,

    // Message methods
    sendMessage: sendMessageSafely,
    clearUnreadCount: teams.clearUnreadCount,

    // UI methods
    openPanel: teams.openPanel,
    closePanel: teams.closePanel,

    // Helper properties
    isReady,
    hasUnread,
    formatUnreadCount,

    // Raw teams context
    raw: teams,
  };
}

export default useTeams;
