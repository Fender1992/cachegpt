'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Check, AlertCircle, Link2, Unlink, Github,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import type { IntegrationStatus } from '@/lib/integrations/types';
import { apiFetch, isDesktop } from '@/lib/api-client';
import { useDesktopIntegrationOAuth } from '@/hooks/useDesktopIntegrationOAuth';

interface IntegrationCardProps {
  provider: 'github';
  userId: string;
}

export default function IntegrationCard({ provider, userId }: IntegrationCardProps) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { startOAuth, connecting: desktopConnecting, cleanup: cleanupDesktopOAuth } = useDesktopIntegrationOAuth();

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
      const res = await apiFetch('/api/integrations/github', { headers });
      if (res.ok) {
        const data: IntegrationStatus = await res.json();
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
    if (params.get('github_connected') === 'true') {
      setMessage({ type: 'success', text: 'GitHub connected!' });
      fetchStatus();
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    }
    const error = params.get('github_error');
    if (error) {
      setMessage({ type: 'error', text: `GitHub connection failed: ${error}` });
      window.history.replaceState({}, '', '/settings');
    }
  }, [fetchStatus]);

  const handleConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    const scope = 'repo,read:user';

    if (isDesktop()) {
      const redirectUri = 'https://cachegpt.app/api/integrations/github/callback';
      const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
      startOAuth(oauthUrl, userId, 'github', () => {
        setMessage({ type: 'success', text: 'GitHub connected!' });
        fetchStatus();
        setTimeout(fetchStatus, 2000);
      }, (error) => {
        setMessage({ type: 'error', text: error });
      });
      return;
    }

    const redirectUri = `${window.location.origin}/api/integrations/github/callback`;
    // Store user ID in a cookie so the callback can identify the user
    // after the GitHub redirect (Supabase session cookies may not survive the redirect)
    document.cookie = `github_oauth_uid=${userId}; path=/; max-age=600; SameSite=Lax; Secure`;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await apiFetch('/api/integrations/github', { method: 'DELETE', headers });
      if (res.ok) {
        setStatus({
          connected: false,
          syncing: false,
          documentCount: 0,
          lastSyncedAt: null,
          providerUserId: null,
          providerData: {},
        });
        setMessage({ type: 'success', text: 'GitHub disconnected.' });
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
          <span className="text-gray-500">Loading integration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Github className="w-5 h-5 text-gray-900 dark:text-white" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            GitHub
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
          <div className="space-y-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
            {status.providerUserId && (
              <p>Account: <span className="font-medium text-gray-900 dark:text-white">@{status.providerUserId}</span></p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 transition disabled:opacity-50"
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
            Connect your GitHub account to get AI responses that are aware of your code, docs, and issues.
          </p>
          <button
            onClick={handleConnect}
            disabled={desktopConnecting}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {desktopConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {desktopConnecting ? 'Connecting...' : 'Connect GitHub'}
          </button>
        </>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            When you ask about your code, we fetch relevant context from your repos on the fly to personalize AI responses.
          </p>
        </div>
      </div>
    </div>
  );
}
