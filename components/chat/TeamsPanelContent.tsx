'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Hash,
  Send,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Users,
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { TeamsChannel } from '@/lib/teams/teams-client';
import { cn } from '@/lib/utils';

interface TeamsPanelContentProps {
  isActive: boolean;
}

type PanelView = 'channels' | 'messages';

export default function TeamsPanelContent({ isActive }: TeamsPanelContentProps) {
  const teams = useTeams();
  const [view, setView] = useState<PanelView>('channels');
  const [composeText, setComposeText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleChannelSelect = useCallback(async (channel: TeamsChannel) => {
    await teams.selectChannel(channel);
    setView('messages');
  }, [teams.selectChannel]);

  const handleBack = useCallback(() => {
    if (view === 'messages') {
      teams.clearSelectedMessage();
      setView('channels');
      setComposeText('');
    }
  }, [view, teams.clearSelectedMessage]);

  const handleSendMessage = useCallback(async () => {
    if (!composeText.trim() || isSending || !teams.selectedChannel) return;
    setIsSending(true);
    try {
      const success = await teams.sendMessage(
        teams.selectedChannel.teamId,
        teams.selectedChannel.id,
        composeText.trim()
      );
      if (success) {
        setComposeText('');
      }
    } finally {
      setIsSending(false);
    }
  }, [composeText, isSending, teams.sendMessage, teams.selectedChannel]);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Group channels by team
  const channelsByTeam = useMemo(() => {
    const grouped = new Map<string, { teamName: string; channels: TeamsChannel[] }>();
    for (const ch of teams.channels) {
      if (!grouped.has(ch.teamId)) {
        grouped.set(ch.teamId, { teamName: ch.teamName, channels: [] });
      }
      grouped.get(ch.teamId)!.channels.push(ch);
    }
    return grouped;
  }, [teams.channels]);

  // Strip HTML tags for display
  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').trim();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Error state */}
      {teams.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{teams.error}</span>
          </div>
          <button
            onClick={() => teams.connect()}
            className="mt-2 px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {teams.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Teams...</span>
          </div>
        </div>
      )}

      {!teams.isConnected && !teams.isConnecting && !teams.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Microsoft Teams to access your workspace
          </p>
          <button
            onClick={() => teams.connect()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Connect Teams
          </button>
        </div>
      )}

      {/* Navigation header for sub-views */}
      {teams.isConnected && view !== 'channels' && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleBack}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" />
              {teams.selectedChannel?.name || 'Messages'}
            </span>
          </span>
        </div>
      )}

      {/* Main Content */}
      {teams.isConnected && (
        <div className="flex-1 overflow-y-auto">
          {view === 'channels' && (
            <div className="p-3">
              {Array.from(channelsByTeam.entries()).map(([teamId, { teamName, channels }]) => (
                <div key={teamId} className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {teamName}
                  </h3>
                  <div className="space-y-1">
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        onClick={() => handleChannelSelect(channel)}
                        className={cn(
                          'w-full flex items-center justify-between p-2.5 rounded-lg text-left text-sm transition-colors',
                          teams.selectedChannel?.id === channel.id
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          <span className="truncate">{channel.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {teams.channels.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No channels found
                </div>
              )}
            </div>
          )}

          {view === 'messages' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {teams.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {msg.userName}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {formatDate(msg.createdDateTime)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                        {msg.contentType === 'html' ? stripHtml(msg.text) : msg.text}
                      </div>
                    </div>
                  ))}
                </div>
                {teams.nextLink && (
                  <div className="p-3 text-center">
                    <button
                      onClick={() => teams.loadMoreMessages()}
                      className="px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                    >
                      Load more
                    </button>
                  </div>
                )}
                {teams.messages.length === 0 && (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No messages in this channel
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick reply input at bottom */}
              <div className="flex-shrink-0 p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={composeText}
                    onChange={(e) => setComposeText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={`Message #${teams.selectedChannel?.name || ''}`}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!composeText.trim() || isSending}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
