'use client';

import { useEffect, useCallback } from 'react';
import { useGmail as useGmailContext } from '@/contexts/GmailContext';
import { GmailLabel } from '@/lib/gmail/gmail-client';

export interface UseGmailOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useGmail(options: UseGmailOptions = {}) {
  const gmail = useGmailContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !gmail.isConnected && !gmail.isConnecting && !gmail.error) {
      gmail.connect().catch(console.error);
    }
  }, [autoConnect, gmail.isConnected, gmail.isConnecting, gmail.error]);

  useEffect(() => {
    if (gmail.isConnected && onConnect) {
      onConnect();
    }
  }, [gmail.isConnected, onConnect]);

  useEffect(() => {
    if (!gmail.isConnected && !gmail.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [gmail.isConnected, gmail.isConnecting, onDisconnect]);

  useEffect(() => {
    if (gmail.error && onError) {
      onError(gmail.error);
    }
  }, [gmail.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await gmail.connect();
      return true;
    } catch (error) {
      console.error('[useGmail] Connection failed:', error);
      return false;
    }
  }, [gmail.connect]);

  const selectLabelSafely = useCallback(async (label: GmailLabel): Promise<boolean> => {
    try {
      await gmail.selectLabel(label);
      return true;
    } catch (error) {
      console.error('[useGmail] Label selection failed:', error);
      return false;
    }
  }, [gmail.selectLabel]);

  const selectMessageSafely = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      await gmail.selectMessage(messageId);
      return true;
    } catch (error) {
      console.error('[useGmail] Message selection failed:', error);
      return false;
    }
  }, [gmail.selectMessage]);

  const deleteMessageSafely = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      await gmail.deleteMessage(messageId);
      return true;
    } catch (error) {
      console.error('[useGmail] Delete message failed:', error);
      return false;
    }
  }, [gmail.deleteMessage]);

  const deleteMessagesSafely = useCallback(async (messageIds: string[]): Promise<boolean> => {
    try {
      await gmail.deleteMessages(messageIds);
      return true;
    } catch (error) {
      console.error('[useGmail] Batch delete failed:', error);
      return false;
    }
  }, [gmail.deleteMessages]);

  const sendEmailSafely = useCallback(async (
    to: string, subject: string, body: string, threadId?: string, inReplyTo?: string
  ): Promise<boolean> => {
    try {
      await gmail.sendEmail(to, subject, body, threadId, inReplyTo);
      return true;
    } catch (error) {
      console.error('[useGmail] Email sending failed:', error);
      return false;
    }
  }, [gmail.sendEmail]);

  const isReady = gmail.isConnected && !gmail.isConnecting;
  const hasUnread = gmail.unreadCount > 0;
  const inboxMessages = gmail.messages;

  const formatUnreadCount = (count: number): string => {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  };

  return {
    // Connection state
    isConnected: gmail.isConnected,
    isConnecting: gmail.isConnecting,
    error: gmail.error,
    email: gmail.email,

    // Label and message state
    labels: gmail.labels,
    selectedLabel: gmail.selectedLabel,
    messages: gmail.messages,
    selectedMessage: gmail.selectedMessage,

    // Counts
    unreadCount: gmail.unreadCount,
    nextPageToken: gmail.nextPageToken,

    // UI state
    isPanelOpen: gmail.isPanelOpen,

    // Connection methods
    connect: connectSafely,
    disconnect: gmail.disconnect,

    // Navigation methods
    selectLabel: selectLabelSafely,
    selectMessage: selectMessageSafely,
    clearSelectedMessage: gmail.clearSelectedMessage,
    loadMoreMessages: gmail.loadMoreMessages,

    // Email methods
    sendEmail: sendEmailSafely,
    deleteMessage: deleteMessageSafely,
    deleteMessages: deleteMessagesSafely,
    clearUnreadCount: gmail.clearUnreadCount,

    // UI methods
    openPanel: gmail.openPanel,
    closePanel: gmail.closePanel,

    // Helper properties
    isReady,
    hasUnread,
    inboxMessages,
    formatUnreadCount,

    // Raw gmail context
    raw: gmail,
  };
}

export default useGmail;
