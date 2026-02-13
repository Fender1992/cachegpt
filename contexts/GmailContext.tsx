'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { gmailClient, GmailState, GmailLabel, GmailMessageFull } from '@/lib/gmail/gmail-client';

interface GmailContextValue extends GmailState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectLabel: (label: GmailLabel) => Promise<void>;
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

const GmailContext = createContext<GmailContextValue | null>(null);

interface GmailProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function GmailProvider({ children, autoConnect = false }: GmailProviderProps) {
  const [state, setState] = useState<GmailState>(gmailClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = gmailClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      gmailClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return gmailClient.connect();
  };

  const disconnect = (): void => {
    gmailClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectLabel = async (label: GmailLabel): Promise<void> => {
    return gmailClient.selectLabel(label);
  };

  const selectMessage = async (messageId: string): Promise<void> => {
    return gmailClient.selectMessage(messageId);
  };

  const clearSelectedMessage = (): void => {
    gmailClient.clearSelectedMessage();
  };

  const loadMoreMessages = async (): Promise<void> => {
    return gmailClient.loadMoreMessages();
  };

  const sendEmail = async (to: string, subject: string, body: string, threadId?: string, inReplyTo?: string): Promise<void> => {
    return gmailClient.sendEmail(to, subject, body, threadId, inReplyTo);
  };

  const clearUnreadCount = (): void => {
    gmailClient.clearUnreadCount();
  };

  const openPanel = (): void => {
    setIsPanelOpen(true);
    clearUnreadCount();
  };

  const closePanel = (): void => {
    setIsPanelOpen(false);
  };

  const contextValue: GmailContextValue = {
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
    <GmailContext.Provider value={contextValue}>
      {children}
    </GmailContext.Provider>
  );
}

export function useGmail(): GmailContextValue {
  const context = useContext(GmailContext);
  if (!context) {
    throw new Error('useGmail must be used within a GmailProvider');
  }
  return context;
}

export default GmailContext;
