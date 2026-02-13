'use client';

import { useEffect, useCallback } from 'react';
import { useYahooContext } from '@/contexts/YahooContext';
import { YahooLabel } from '@/lib/yahoo/yahoo-client';

export interface UseYahooOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useYahoo(options: UseYahooOptions = {}) {
  const yahoo = useYahooContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !yahoo.isConnected && !yahoo.isConnecting && !yahoo.error) {
      yahoo.connect().catch(console.error);
    }
  }, [autoConnect, yahoo.isConnected, yahoo.isConnecting, yahoo.error]);

  useEffect(() => {
    if (yahoo.isConnected && onConnect) {
      onConnect();
    }
  }, [yahoo.isConnected, onConnect]);

  useEffect(() => {
    if (!yahoo.isConnected && !yahoo.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [yahoo.isConnected, yahoo.isConnecting, onDisconnect]);

  useEffect(() => {
    if (yahoo.error && onError) {
      onError(yahoo.error);
    }
  }, [yahoo.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await yahoo.connect();
      return true;
    } catch (error) {
      console.error('[useYahoo] Connection failed:', error);
      return false;
    }
  }, [yahoo.connect]);

  const selectLabelSafely = useCallback(async (label: YahooLabel): Promise<boolean> => {
    try {
      await yahoo.selectLabel(label);
      return true;
    } catch (error) {
      console.error('[useYahoo] Label selection failed:', error);
      return false;
    }
  }, [yahoo.selectLabel]);

  const selectMessageSafely = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      await yahoo.selectMessage(messageId);
      return true;
    } catch (error) {
      console.error('[useYahoo] Message selection failed:', error);
      return false;
    }
  }, [yahoo.selectMessage]);

  const sendEmailSafely = useCallback(async (
    to: string, subject: string, body: string, threadId?: string, inReplyTo?: string
  ): Promise<boolean> => {
    try {
      await yahoo.sendEmail(to, subject, body, threadId, inReplyTo);
      return true;
    } catch (error) {
      console.error('[useYahoo] Email sending failed:', error);
      return false;
    }
  }, [yahoo.sendEmail]);

  const isReady = yahoo.isConnected && !yahoo.isConnecting;
  const hasUnread = yahoo.unreadCount > 0;
  const inboxMessages = yahoo.messages;

  const formatUnreadCount = (count: number): string => {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  };

  return {
    // Connection state
    isConnected: yahoo.isConnected,
    isConnecting: yahoo.isConnecting,
    error: yahoo.error,
    email: yahoo.email,

    // Label and message state
    labels: yahoo.labels,
    selectedLabel: yahoo.selectedLabel,
    messages: yahoo.messages,
    selectedMessage: yahoo.selectedMessage,

    // Counts
    unreadCount: yahoo.unreadCount,
    nextPageToken: yahoo.nextPageToken,

    // UI state
    isPanelOpen: yahoo.isPanelOpen,

    // Connection methods
    connect: connectSafely,
    disconnect: yahoo.disconnect,

    // Navigation methods
    selectLabel: selectLabelSafely,
    selectMessage: selectMessageSafely,
    clearSelectedMessage: yahoo.clearSelectedMessage,
    loadMoreMessages: yahoo.loadMoreMessages,

    // Email methods
    sendEmail: sendEmailSafely,
    clearUnreadCount: yahoo.clearUnreadCount,

    // UI methods
    openPanel: yahoo.openPanel,
    closePanel: yahoo.closePanel,

    // Helper properties
    isReady,
    hasUnread,
    inboxMessages,
    formatUnreadCount,

    // Raw yahoo context
    raw: yahoo,
  };
}

export default useYahoo;
