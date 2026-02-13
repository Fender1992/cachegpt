'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { jiraClient, JiraState, JiraProject } from '@/lib/jira/jira-client';
import { panelManager } from '@/lib/panel-manager';

interface JiraContextValue extends JiraState {
  connect: () => Promise<void>;
  disconnect: () => void;
  selectProject: (project: JiraProject) => Promise<void>;
  selectIssue: (issueKey: string) => Promise<void>;
  searchIssues: (jql: string) => Promise<void>;
  clearSelectedIssue: () => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const JiraContext = createContext<JiraContextValue | null>(null);

interface JiraProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function JiraProvider({ children, autoConnect = false }: JiraProviderProps) {
  const [state, setState] = useState<JiraState>(jiraClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = jiraClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      jiraClient.connect().catch(console.error);
    }

    return unsubscribe;
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return jiraClient.connect();
  };

  const disconnect = (): void => {
    jiraClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectProject = async (project: JiraProject): Promise<void> => {
    return jiraClient.selectProject(project);
  };

  const selectIssue = async (issueKey: string): Promise<void> => {
    return jiraClient.selectIssue(issueKey);
  };

  const searchIssues = async (jql: string): Promise<void> => {
    return jiraClient.searchIssues(jql);
  };

  const clearSelectedIssue = (): void => {
    jiraClient.clearSelectedIssue();
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  useEffect(() => {
    panelManager.register('jira', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('jira');
    setIsPanelOpen(true);
  };

  const contextValue: JiraContextValue = {
    ...state,
    connect,
    disconnect,
    selectProject,
    selectIssue,
    searchIssues,
    clearSelectedIssue,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <JiraContext.Provider value={contextValue}>
      {children}
    </JiraContext.Provider>
  );
}

export function useJiraContext(): JiraContextValue {
  const context = useContext(JiraContext);
  if (!context) {
    throw new Error('useJiraContext must be used within a JiraProvider');
  }
  return context;
}

export default JiraContext;
