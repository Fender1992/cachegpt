'use client';

import { useEffect, useCallback } from 'react';
import { useSlackContext } from '@/contexts/SlackContext';
import { SlackChannel } from '@/lib/slack/slack-client';

export interface UseSlackOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useSlack(options: UseSlackOptions = {}) {
  const slack = useSlackContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !slack.isConnected && !slack.isConnecting && !slack.error) {
      slack.connect().catch(console.error);
    }
  }, [autoConnect, slack.isConnected, slack.isConnecting, slack.error]);

  useEffect(() => {
    if (slack.isConnected && onConnect) {
      onConnect();
    }
  }, [slack.isConnected, onConnect]);

  useEffect(() => {
    if (!slack.isConnected && !slack.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [slack.isConnected, slack.isConnecting, onDisconnect]);

  useEffect(() => {
    if (slack.error && onError) {
      onError(slack.error);
    }
  }, [slack.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await slack.connect();
      return true;
    } catch (error) {
      console.error('[useSlack] Connection failed:', error);
      return false;
    }
  }, [slack.connect]);

  const selectChannelSafely = useCallback(async (channel: SlackChannel): Promise<boolean> => {
    try {
      await slack.selectChannel(channel);
      return true;
    } catch (error) {
      console.error('[useSlack] Channel selection failed:', error);
      return false;
    }
  }, [slack.selectChannel]);

  const sendMessageSafely = useCallback(async (
    channelId: string, text: string, threadTs?: string
  ): Promise<boolean> => {
    try {
      await slack.sendMessage(channelId, text, threadTs);
      return true;
    } catch (error) {
      console.error('[useSlack] Message sending failed:', error);
      return false;
    }
  }, [slack.sendMessage]);

  const isReady = slack.isConnected && !slack.isConnecting;
  const hasUnread = slack.unreadCount > 0;

  const formatUnreadCount = (count: number): string => {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  };

  return {
    // Connection state
    isConnected: slack.isConnected,
    isConnecting: slack.isConnecting,
    error: slack.error,
    teamName: slack.teamName,
    userName: slack.userName,

    // Channel and message state
    channels: slack.channels,
    selectedChannel: slack.selectedChannel,
    messages: slack.messages,
    selectedMessage: slack.selectedMessage,

    // Counts
    unreadCount: slack.unreadCount,
    nextCursor: slack.nextCursor,

    // UI state
    isPanelOpen: slack.isPanelOpen,

    // Connection methods
    connect: connectSafely,
    disconnect: slack.disconnect,

    // Navigation methods
    selectChannel: selectChannelSafely,
    selectMessage: slack.selectMessage,
    clearSelectedMessage: slack.clearSelectedMessage,
    loadMoreMessages: slack.loadMoreMessages,

    // Message methods
    sendMessage: sendMessageSafely,
    clearUnreadCount: slack.clearUnreadCount,

    // UI methods
    openPanel: slack.openPanel,
    closePanel: slack.closePanel,

    // Helper properties
    isReady,
    hasUnread,
    formatUnreadCount,

    // Raw slack context
    raw: slack,
  };
}

export default useSlack;
