/**
 * Google Drive Client Wrapper
 * Routes all Drive API calls through our backend proxy.
 */

import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number | null;
  iconLink: string;
  webViewLink: string;
  owner: string;
}

export interface DriveFileDetail {
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number | null;
    webViewLink: string;
  };
  content: string;
  exportedAs: string;
}

export interface DriveState {
  isConnected: boolean;
  isConnecting: boolean;
  email: string | null;
  files: DriveFile[];
  selectedFile: DriveFileDetail | null;
  error: string | null;
}

export class DriveClient {
  private connected = false;
  private listeners: Set<(state: DriveState) => void> = new Set();
  private state: DriveState = {
    isConnected: false,
    isConnecting: false,
    email: null,
    files: [],
    selectedFile: null,
    error: null,
  };

  subscribe(listener: (state: DriveState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<DriveState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): DriveState {
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
      const statusRes = await apiFetch('/api/integrations/google-drive', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Google Drive status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Google Drive not connected. Please link your account in Settings.');
      }

      this.connected = true;

      // Fetch recent files
      const filesRes = await apiFetch('/api/integrations/google-drive/files', { headers });
      const filesData = filesRes.ok ? await filesRes.json() : { files: [] };

      this.updateState({
        isConnected: true,
        isConnecting: false,
        email: status.email,
        files: filesData.files || [],
        error: null,
      });
    } catch (error) {
      console.error('[Drive Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Google Drive',
      });
    }
  }

  disconnect(): void {
    this.connected = false;
    this.updateState({
      isConnected: false,
      isConnecting: false,
      email: null,
      files: [],
      selectedFile: null,
    });
  }

  async searchFiles(query: string): Promise<void> {
    if (!this.connected) return;

    try {
      const headers = await this.getAuthHeader();
      const params = new URLSearchParams();
      if (query) params.set('q', query);

      const res = await apiFetch(`/api/integrations/google-drive/files?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        this.updateState({ files: data.files || [] });
      }
    } catch (error) {
      console.error('[Drive Client] Search error:', error);
    }
  }

  async selectFile(fileId: string): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({ selectedFile: null });
      const headers = await this.getAuthHeader();
      const res = await apiFetch(`/api/integrations/google-drive/files?fileId=${fileId}`, { headers });

      if (res.ok) {
        const data = await res.json();
        this.updateState({ selectedFile: data });
      }
    } catch (error) {
      console.error('[Drive Client] File detail error:', error);
    }
  }

  clearSelectedFile(): void {
    this.updateState({ selectedFile: null });
  }

  async deleteFile(fileId: string): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const headers = await this.getAuthHeader();
      const res = await apiFetch(
        `/api/integrations/google-drive/files?fileId=${encodeURIComponent(fileId)}`,
        { method: 'DELETE', headers }
      );

      if (!res.ok) return false;

      // Remove from current state
      this.updateState({
        files: this.state.files.filter(f => f.id !== fileId),
        selectedFile: this.state.selectedFile?.file.id === fileId ? null : this.state.selectedFile,
      });
      return true;
    } catch (error) {
      console.error('[Drive Client] Error deleting file:', error);
      return false;
    }
  }
}

// Global client instance
export const driveClient = new DriveClient();
