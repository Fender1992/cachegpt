/**
 * Integration Types
 * Generic type system for all data source integrations (GitHub, LinkedIn, etc.)
 */

export type IntegrationProvider = 'github' | 'discord' | 'gmail' | 'yahoo' | 'linkedin' | 'instagram';

export interface UserIntegration {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  provider_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  provider_data: Record<string, any>;
  status: 'active' | 'syncing' | 'error' | 'disconnected';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationDocument {
  id: string;
  user_id: string;
  integration_id: string;
  provider: IntegrationProvider;
  source_type: string;
  source_id: string;
  source_url: string | null;
  title: string | null;
  content: string;
  chunk_index: number;
  embedding: number[] | null;
  metadata: Record<string, any>;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationSearchResult {
  id: string;
  provider: string;
  source_type: string;
  source_id: string;
  source_url: string | null;
  title: string | null;
  content: string;
  chunk_index: number;
  metadata: Record<string, any>;
  similarity: number;
}

export interface IntegrationAdapter {
  provider: IntegrationProvider;
  connect(userId: string, authCode: string): Promise<UserIntegration>;
  sync(userId: string, integrationId: string, accessToken: string): Promise<void>;
  disconnect(userId: string, integrationId: string): Promise<void>;
}

export interface IntegrationStatus {
  connected: boolean;
  syncing: boolean;
  documentCount: number;
  lastSyncedAt: string | null;
  providerUserId: string | null;
  providerData: Record<string, any>;
}
