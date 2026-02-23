'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Check, AlertCircle, Link2, Unlink, FileText, BookOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

interface NotionIntegrationStatus {
  connected: boolean;
  workspaceName: string | null;
  workspaceIcon: string | null;
  pageCount: number;
  lastSyncedAt: string | null;
  providerData: {
    workspace_name?: string;
    workspace_icon?: string;
    page_count?: number;
  };
}

interface NotionIntegrationCardProps {
  userId: string;
}

export default function NotionIntegrationCard({ userId }: NotionIntegrationCardProps) {
  const [status, setStatus] = useState<NotionIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await apiFetch('/api/integrations/notion', { headers });
      if (res.ok) {
        const data: NotionIntegrationStatus = await res.json();
        setStatus(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notion_connected') === 'true') {
      setMessage({ type: 'success', text: 'Notion connected successfully!' });
      fetchStatus();
      window.history.replaceState({}, '', '/settings');
    }
    const error = params.get('notion_error');
    if (error) {
      setMessage({ type: 'error', text: `Notion connection failed: ${error}` });
      window.history.replaceState({}, '', '/settings');
    }
  }, [fetchStatus]);

  const handleConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/integrations/notion/callback`;

    // Store user ID in cookie for callback
    document.cookie = `notion_oauth_uid=${userId}; path=/; max-age=600; SameSite=Lax; Secure`;

    // Notion OAuth URL
    window.location.href = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&owner=user`;
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await apiFetch('/api/integrations/notion', {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        setStatus({
          connected: false,
          workspaceName: null,
          workspaceIcon: null,
          pageCount: 0,
          lastSyncedAt: null,
          providerData: {},
        });
        setMessage({ type: 'success', text: 'Notion disconnected.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect.' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-gray-500">Loading Notion integration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <BookOpen className="w-5 h-5 text-gray-800 dark:text-gray-200" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Notion
          </h2>
        </div>

        {status?.connected && (
          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Connected
          </span>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
          message.type === 'success'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {message.type === 'success' ? (
            <Check className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {status?.connected ? (
        <>
          {/* Connected info */}
          <div className="space-y-3 mb-4">
            {status.workspaceName && (
              <div className="flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Workspace:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {status.workspaceIcon && <span className="mr-1">{status.workspaceIcon}</span>}
                  {status.workspaceName}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Pages Accessible</span>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {status.pageCount || 0}+
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Connect your Notion workspace to get AI responses that understand your notes,
            documents, and databases.
          </p>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-gray-300 transition"
          >
            <Link2 className="w-4 h-4" />
            Connect Notion
          </button>
        </>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>
              When you ask questions, we search your Notion pages on demand to provide relevant context.
            </p>
            <p>
              Read-only access. Only pages shared with the integration are searchable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
