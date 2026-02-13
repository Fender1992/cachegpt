'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { driveClient, DriveState, DriveFile, DriveFileDetail } from '@/lib/google-drive/drive-client';
import { panelManager } from '@/lib/panel-manager';

interface DriveContextValue extends DriveState {
  connect: () => Promise<void>;
  disconnect: () => void;
  searchFiles: (query: string) => Promise<void>;
  selectFile: (fileId: string) => Promise<void>;
  clearSelectedFile: () => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const DriveContext = createContext<DriveContextValue | null>(null);

interface DriveProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function DriveProvider({ children, autoConnect = false }: DriveProviderProps) {
  const [state, setState] = useState<DriveState>(driveClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = driveClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      driveClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return driveClient.connect();
  };

  const disconnect = (): void => {
    driveClient.disconnect();
    setIsPanelOpen(false);
  };

  const searchFiles = async (query: string): Promise<void> => {
    return driveClient.searchFiles(query);
  };

  const selectFile = async (fileId: string): Promise<void> => {
    return driveClient.selectFile(fileId);
  };

  const clearSelectedFile = (): void => {
    driveClient.clearSelectedFile();
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  useEffect(() => {
    panelManager.register('drive', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('drive');
    setIsPanelOpen(true);
  };

  const contextValue: DriveContextValue = {
    ...state,
    connect,
    disconnect,
    searchFiles,
    selectFile,
    clearSelectedFile,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <DriveContext.Provider value={contextValue}>
      {children}
    </DriveContext.Provider>
  );
}

export function useDriveContext(): DriveContextValue {
  const context = useContext(DriveContext);
  if (!context) {
    throw new Error('useDriveContext must be used within a DriveProvider');
  }
  return context;
}

export default DriveContext;
