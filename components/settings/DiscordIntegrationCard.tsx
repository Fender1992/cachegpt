'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Check, AlertCircle, Link2, Unlink, MessageSquare, Server, Hash, Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { apiFetch, isDesktop } from '@/lib/api-client';
import { useDesktopIntegrationOAuth } from '@/hooks/useDesktopIntegrationOAuth';

interface DiscordIntegrationStatus {
  connected: boolean;
  syncing: boolean;
  documentCount: number;
  guildCount: number;
  channelCount: number;
  lastSyncedAt: string | null;
  providerUserId: string | null;
  providerData: {
    username?: string;
    discriminator?: string;
    global_name?: string;
    guild_count?: number;
    guilds?: Array<{
      id: string;
      name: string;
      icon?: string;
    }>;
  };
}

interface DiscordIntegrationCardProps {
  userId: string;
}

export default function DiscordIntegrationCard({ userId }: DiscordIntegrationCardProps) {
  const [status, setStatus] = useState<DiscordIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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
      const res = await apiFetch('/api/integrations/discord', { headers });
      if (res.ok) {
        const data: DiscordIntegrationStatus = await res.json();
        setStatus(data);
        setSyncing(data.syncing);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchStatus();
    // Poll for status updates while syncing
    const interval = setInterval(() => {
      if (syncing) {
        fetchStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, syncing]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('discord_connected') === 'true') {
      setMessage({ type: 'success', text: 'Discord connected successfully! Initial sync started...' });
      setSyncing(true);
      fetchStatus();
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    }
    const error = params.get('discord_error');
    if (error) {
      setMessage({ type: 'error', text: `Discord connection failed: ${error}` });
      window.history.replaceState({}, '', '/settings');
    }
  }, [fetchStatus]);

  const handleConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    const scope = 'identify guilds guilds.members.read messages.read';

    if (isDesktop()) {
      const redirectUri = 'https://cachegpt.app/api/integrations/discord/callback';
      const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
      startOAuth(oauthUrl, userId, 'discord', () => {
        setMessage({ type: 'success', text: 'Discord connected successfully!' });
        setSyncing(true);
        fetchStatus();
      }, (error) => {
        setMessage({ type: 'error', text: error });
      });
      return;
    }

    const redirectUri = `${window.location.origin}/api/integrations/discord/callback`;

    // Store user ID in cookie for callback
    document.cookie = `discord_oauth_uid=${userId}; path=/; max-age=600; SameSite=Lax; Secure`;

    // Discord OAuth URL
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await apiFetch('/api/integrations/discord/sync', {
        method: 'POST',
        headers
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Discord sync started. This may take a few minutes...' });
        // Start polling for status updates
        setTimeout(fetchStatus, 2000);
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Failed to start sync.' });
        setSyncing(false);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to start sync.' });
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await apiFetch('/api/integrations/discord', {
        method: 'DELETE',
        headers
      });
      
      if (res.ok) {
        setStatus({
          connected: false,
          syncing: false,
          documentCount: 0,
          guildCount: 0,
          channelCount: 0,
          lastSyncedAt: null,
          providerUserId: null,
          providerData: {},
        });
        setMessage({ type: 'success', text: 'Discord disconnected.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const formatLastSynced = (date: string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-gray-500">Loading Discord integration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Discord
          </h2>
        </div>

        {status?.connected && (
          <div className="flex items-center gap-2">
            {syncing ? (
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Syncing
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Connected
              </span>
            )}
          </div>
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
            {status.providerData?.username && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">Account:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {status.providerData.global_name || status.providerData.username}
                  {status.providerData.discriminator && `#${status.providerData.discriminator}`}
                </span>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                  <Server className="w-3.5 h-3.5" />
                  <span className="text-xs">Servers</span>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {status.guildCount || 0}
                </p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                  <Hash className="w-3.5 h-3.5" />
                  <span className="text-xs">Channels</span>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {status.channelCount || 0}
                </p>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="text-xs">Messages</span>
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {status.documentCount || 0}
                </p>
              </div>
            </div>
            
            {status.lastSyncedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last synced: {formatLastSynced(status.lastSyncedAt)}
              </p>
            )}
            
            {/* Show some connected servers */}
            {status.providerData.guilds && status.providerData.guilds.length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Connected Servers:
                </p>
                <div className="space-y-1">
                  {status.providerData.guilds.slice(0, 3).map(guild => (
                    <div key={guild.id} className="flex items-center gap-2">
                      <Server className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {guild.name}
                      </span>
                    </div>
                  ))}
                  {status.providerData.guilds.length > 3 && (
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      ... and {status.providerData.guilds.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5" />
              )}
              {syncing ? 'Syncing...' : 'Sync Messages'}
            </button>
            
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
            Connect your Discord account to get AI responses that understand your server conversations, 
            team discussions, and community context.
          </p>
          <button
            onClick={handleConnect}
            disabled={desktopConnecting}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {desktopConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {desktopConnecting ? 'Connecting...' : 'Connect Discord'}
          </button>
        </>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>
              When you ask questions, we search your Discord messages to provide relevant context.
            </p>
            <p>
              Only servers and channels you have access to will be indexed. Private messages are not accessed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}