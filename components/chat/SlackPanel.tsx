'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  MessageSquare,
  Hash,
  Send,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Lock,
} from 'lucide-react';
import { useSlack } from '@/hooks/useSlack';
import { SlackChannel } from '@/lib/slack/slack-client';
import { cn } from '@/lib/utils';

interface SlackPanelProps {
  className?: string;
}

type PanelView = 'channels' | 'messages' | 'compose';

export default function SlackPanel({ className }: SlackPanelProps) {
  const slack = useSlack();
  const [view, setView] = useState<PanelView>('channels');
  const [composeText, setComposeText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyThreadTs, setReplyThreadTs] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset view when panel closes
  useEffect(() => {
    if (!slack.isPanelOpen) {
      setView('channels');
    }
  }, [slack.isPanelOpen]);

  const handleChannelSelect = useCallback(async (channel: SlackChannel) => {
    await slack.selectChannel(channel);
    setView('messages');
  }, [slack.selectChannel]);

  const handleBack = useCallback(() => {
    if (view === 'messages' || view === 'compose') {
      slack.clearSelectedMessage();
      setView('channels');
      setComposeText('');
      setReplyThreadTs(undefined);
    }
  }, [view, slack.clearSelectedMessage]);

  const handleReply = useCallback((threadTs: string) => {
    setReplyThreadTs(threadTs);
    setView('compose');
  }, []);

  const handleSend = useCallback(async () => {
    if (!composeText.trim() || isSending || !slack.selectedChannel) return;

    setIsSending(true);
    try {
      const success = await slack.sendMessage(
        slack.selectedChannel.id,
        composeText.trim(),
        replyThreadTs
      );
      if (success) {
        setComposeText('');
        setReplyThreadTs(undefined);
        setView('messages');
      }
    } finally {
      setIsSending(false);
    }
  }, [composeText, isSending, slack.sendMessage, slack.selectedChannel, replyThreadTs]);

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

  if (!slack.isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={slack.closePanel}
      />
      <div className={cn(
        'fixed top-[85px] left-0 h-[calc(100%-85px-4rem)] w-96 max-w-[85vw] bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col rounded-br-xl',
        'transform transition-transform duration-300 ease-in-out',
        className
      )}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            {view !== 'channels' && (
              <button
                onClick={handleBack}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Slack
            </h2>
            {slack.isConnected && slack.teamName && (
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                {slack.teamName}
              </span>
            )}
          </div>
          <button
            onClick={slack.closePanel}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close Slack panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error state */}
        {slack.error && (
          <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{slack.error}</span>
            </div>
            <button
              onClick={() => slack.connect()}
              className="mt-2 px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {slack.isConnecting && (
          <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Connecting to Slack...</span>
            </div>
          </div>
        )}

        {!slack.isConnected && !slack.isConnecting && !slack.error && (
          <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              Connect to Slack to access your workspace
            </p>
            <button
              onClick={() => slack.connect()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Connect Slack
            </button>
          </div>
        )}

        {/* Main Content */}
        {slack.isConnected && (
          <div className="flex-1 overflow-y-auto">
            {/* Channels View */}
            {view === 'channels' && (
              <div className="p-3">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Channels
                </h3>
                <div className="space-y-1">
                  {slack.channels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handleChannelSelect(channel)}
                      className={cn(
                        'w-full flex items-center justify-between p-2.5 rounded-lg text-left text-sm transition-colors',
                        slack.selectedChannel?.id === channel.id
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {channel.isPrivate ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <Hash className="w-4 h-4" />
                        )}
                        <span className="truncate">{channel.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {channel.unreadCount > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500 text-white font-medium">
                            {channel.unreadCount}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {channel.memberCount}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {slack.channels.length === 0 && (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No channels found
                  </div>
                )}
              </div>
            )}

            {/* Messages View */}
            {view === 'messages' && (
              <div>
                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                    {slack.selectedChannel?.isPrivate ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Hash className="w-4 h-4" />
                    )}
                    {slack.selectedChannel?.name || 'Messages'}
                  </h3>
                  {slack.selectedChannel?.topic && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {slack.selectedChannel.topic}
                    </p>
                  )}
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {slack.messages.map((msg) => (
                    <div
                      key={msg.ts}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {msg.userName}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {formatDate(msg.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                        {msg.text}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {msg.replyCount > 0 && (
                          <span className="text-xs text-purple-600 dark:text-purple-400">
                            {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
                          </span>
                        )}
                        <button
                          onClick={() => handleReply(msg.threadTs || msg.ts)}
                          className="text-xs text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {slack.nextCursor && (
                  <div className="p-3 text-center">
                    <button
                      onClick={() => slack.loadMoreMessages()}
                      className="px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                    >
                      Load more
                    </button>
                  </div>
                )}
                {slack.messages.length === 0 && (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No messages in this channel
                  </div>
                )}

                {/* Quick reply input at bottom */}
                <div className="sticky bottom-0 p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (slack.selectedChannel && composeText.trim()) {
                            setIsSending(true);
                            slack.sendMessage(slack.selectedChannel.id, composeText.trim())
                              .then(() => setComposeText(''))
                              .finally(() => setIsSending(false));
                          }
                        }
                      }}
                      placeholder={`Message #${slack.selectedChannel?.name || ''}`}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={() => {
                        if (slack.selectedChannel && composeText.trim()) {
                          setIsSending(true);
                          slack.sendMessage(slack.selectedChannel.id, composeText.trim())
                            .then(() => setComposeText(''))
                            .finally(() => setIsSending(false));
                        }
                      }}
                      disabled={!composeText.trim() || isSending}
                      className="p-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Compose (Thread Reply) View */}
            {view === 'compose' && (
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Reply in thread
                </p>
                <textarea
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  placeholder="Write a reply..."
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSend}
                    disabled={!composeText.trim() || isSending}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
