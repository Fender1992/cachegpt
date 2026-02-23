/**
 * Jira Client Wrapper
 * Routes all Jira API calls through our backend proxy.
 */

import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrl: string;
  projectTypeKey: string;
  style: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  assignee: string;
  projectKey: string;
  projectName: string;
  updated: string;
  created: string;
}

export interface JiraIssueDetail {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  assignee: string;
  reporter: string;
  projectKey: string;
  projectName: string;
  labels: string[];
  components: string[];
  updated: string;
  created: string;
  comments: {
    id: string;
    author: string;
    body: string;
    created: string;
    updated: string;
  }[];
}

export interface JiraState {
  isConnected: boolean;
  isConnecting: boolean;
  email: string | null;
  siteName: string | null;
  projects: JiraProject[];
  selectedProject: JiraProject | null;
  issues: JiraIssue[];
  selectedIssue: JiraIssueDetail | null;
  error: string | null;
}

export class JiraClient {
  private connected = false;
  private listeners: Set<(state: JiraState) => void> = new Set();
  private state: JiraState = {
    isConnected: false,
    isConnecting: false,
    email: null,
    siteName: null,
    projects: [],
    selectedProject: null,
    issues: [],
    selectedIssue: null,
    error: null,
  };

  subscribe(listener: (state: JiraState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<JiraState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): JiraState {
    return this.state;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) return;

    try {
      this.updateState({ isConnecting: true, error: null });

      const headers = await this.getAuthHeader();
      const statusRes = await apiFetch('/api/integrations/jira', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Jira status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Jira not connected. Please link your account in Settings.');
      }

      this.connected = true;

      // Fetch projects
      const projectsRes = await apiFetch('/api/integrations/jira/projects', { headers });
      const projectsData = projectsRes.ok ? await projectsRes.json() : { projects: [] };

      this.updateState({
        isConnected: true,
        isConnecting: false,
        email: status.email,
        siteName: status.siteName,
        projects: projectsData.projects || [],
        error: null,
      });
    } catch (error) {
      console.error('[Jira Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Jira',
      });
    }
  }

  disconnect(): void {
    this.connected = false;
    this.updateState({
      isConnected: false,
      isConnecting: false,
      email: null,
      siteName: null,
      projects: [],
      selectedProject: null,
      issues: [],
      selectedIssue: null,
    });
  }

  async selectProject(project: JiraProject): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({
        selectedProject: project,
        selectedIssue: null,
        issues: [],
      });

      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/jira/issues?projectKey=${encodeURIComponent(project.key)}`,
        { headers }
      );

      if (res.ok) {
        const data = await res.json();
        this.updateState({ issues: data.issues || [] });
      }
    } catch (error) {
      console.error('[Jira Client] Error selecting project:', error);
      this.updateState({ error: 'Failed to load issues' });
    }
  }

  async selectIssue(issueKey: string): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({ selectedIssue: null });
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/jira/issues?issueKey=${encodeURIComponent(issueKey)}`,
        { headers }
      );

      if (res.ok) {
        const data = await res.json();
        this.updateState({ selectedIssue: data.issue || null });
      }
    } catch (error) {
      console.error('[Jira Client] Error getting issue detail:', error);
    }
  }

  async searchIssues(jql: string): Promise<void> {
    if (!this.connected) return;

    try {
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/jira/issues?jql=${encodeURIComponent(jql)}`,
        { headers }
      );

      if (res.ok) {
        const data = await res.json();
        this.updateState({ issues: data.issues || [] });
      }
    } catch (error) {
      console.error('[Jira Client] Search error:', error);
    }
  }

  clearSelectedIssue(): void {
    this.updateState({ selectedIssue: null });
  }
}

// Global client instance
export const jiraClient = new JiraClient();
