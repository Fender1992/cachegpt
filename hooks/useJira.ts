'use client';

import { useEffect, useCallback } from 'react';
import { useJiraContext } from '@/contexts/JiraContext';
import { JiraProject } from '@/lib/jira/jira-client';

export interface UseJiraOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useJira(options: UseJiraOptions = {}) {
  const jira = useJiraContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !jira.isConnected && !jira.isConnecting && !jira.error) {
      jira.connect().catch(console.error);
    }
  }, [autoConnect, jira.isConnected, jira.isConnecting, jira.error]);

  useEffect(() => {
    if (jira.isConnected && onConnect) {
      onConnect();
    }
  }, [jira.isConnected, onConnect]);

  useEffect(() => {
    if (!jira.isConnected && !jira.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [jira.isConnected, jira.isConnecting, onDisconnect]);

  useEffect(() => {
    if (jira.error && onError) {
      onError(jira.error);
    }
  }, [jira.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await jira.connect();
      return true;
    } catch (error) {
      console.error('[useJira] Connection failed:', error);
      return false;
    }
  }, [jira.connect]);

  const selectProjectSafely = useCallback(async (project: JiraProject): Promise<boolean> => {
    try {
      await jira.selectProject(project);
      return true;
    } catch (error) {
      console.error('[useJira] Project selection failed:', error);
      return false;
    }
  }, [jira.selectProject]);

  return {
    // Connection state
    isConnected: jira.isConnected,
    isConnecting: jira.isConnecting,
    error: jira.error,
    email: jira.email,
    siteName: jira.siteName,

    // Data state
    projects: jira.projects,
    selectedProject: jira.selectedProject,
    issues: jira.issues,
    selectedIssue: jira.selectedIssue,

    // UI state
    isPanelOpen: jira.isPanelOpen,

    // Methods
    connect: connectSafely,
    disconnect: jira.disconnect,
    selectProject: selectProjectSafely,
    selectIssue: jira.selectIssue,
    searchIssues: jira.searchIssues,
    clearSelectedIssue: jira.clearSelectedIssue,

    // UI methods
    openPanel: jira.openPanel,
    closePanel: jira.closePanel,

    // Raw context
    raw: jira,
  };
}

export default useJira;
