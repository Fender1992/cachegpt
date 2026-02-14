'use client';

import { useEffect, useCallback } from 'react';
import { useDriveContext } from '@/contexts/DriveContext';

export interface UseDriveOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useDrive(options: UseDriveOptions = {}) {
  const drive = useDriveContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !drive.isConnected && !drive.isConnecting && !drive.error) {
      drive.connect().catch(console.error);
    }
  }, [autoConnect, drive.isConnected, drive.isConnecting, drive.error]);

  useEffect(() => {
    if (drive.isConnected && onConnect) {
      onConnect();
    }
  }, [drive.isConnected, onConnect]);

  useEffect(() => {
    if (!drive.isConnected && !drive.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [drive.isConnected, drive.isConnecting, onDisconnect]);

  useEffect(() => {
    if (drive.error && onError) {
      onError(drive.error);
    }
  }, [drive.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await drive.connect();
      return true;
    } catch (error) {
      console.error('[useDrive] Connection failed:', error);
      return false;
    }
  }, [drive.connect]);

  return {
    // Connection state
    isConnected: drive.isConnected,
    isConnecting: drive.isConnecting,
    error: drive.error,
    email: drive.email,

    // File state
    files: drive.files,
    selectedFile: drive.selectedFile,

    // UI state
    isPanelOpen: drive.isPanelOpen,

    // Methods
    connect: connectSafely,
    disconnect: drive.disconnect,
    searchFiles: drive.searchFiles,
    selectFile: drive.selectFile,
    clearSelectedFile: drive.clearSelectedFile,
    deleteFile: drive.deleteFile,

    // UI methods
    openPanel: drive.openPanel,
    closePanel: drive.closePanel,

    // Raw context
    raw: drive,
  };
}

export default useDrive;
