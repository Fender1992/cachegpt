'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Hash,
  Users,
  Send,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  Copy,
  Check
} from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { DiscordMessage, DiscordGuild, DiscordChannel } from '@/lib/discord/discord-gateway';
import { cn } from '@/lib/utils';

interface DiscordPanelContentProps {
  isActive: boolean;
}

export default function DiscordPanelContent({ isActive }: DiscordPanelContentProps) {
  const discord = useDiscord();
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [expandedGuilds, setExpandedGuilds] = useState<Set<string>>(new Set());
  const [copiedGuildId, setCopiedGuildId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [discord.messages]);

  // Focus input when tab becomes active
  useEffect(() => {
    if (isActive && discord.canSendMessages) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isActive, discord.canSendMessages]);

  const toggleGuildExpansion = useCallback((guildId: string) => {
    setExpandedGuilds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(guildId)) {
        newSet.delete(guildId);
      } else {
        newSet.add(guildId);
      }
      return newSet;
    });
  }, []);

  const handleGuildSelect = useCallback(async (guild: DiscordGuild) => {
    if (guild.id === discord.selectedGuild?.id) return;
    await discord.selectGuild(guild);
    setExpandedGuilds(prev => new Set(prev).add(guild.id));
  }, [discord.selectGuild, discord.selectedGuild]);

  const handleChannelSelect = useCallback(async (channel: DiscordChannel) => {
    if (channel.id === discord.selectedChannel?.id) return;
    await discord.selectChannel(channel);
  }, [discord.selectChannel, discord.selectedChannel]);

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || isSending || !discord.canSendMessages) return;
    setIsSending(true);
    try {
      const success = await discord.sendMessage(messageInput.trim());
      if (success) {
        setMessageInput('');
      }
    } finally {
      setIsSending(false);
    }
  }, [messageInput, isSending, discord.canSendMessages, discord.sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleCopyInviteLink = useCallback(async (guildId: string) => {
    const url = discord.getInviteUrl(guildId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedGuildId(guildId);
      setTimeout(() => setCopiedGuildId(null), 2000);
    } catch (err) {
      console.error('[DiscordPanelContent] Failed to copy invite link:', err);
    }
  }, [discord.getInviteUrl]);

  const sortedGuilds = [...discord.guilds].sort((a, b) => {
    const order = { full_access: 0, unknown: 1, no_bot: 2 };
    const aOrder = order[a.botStatus || 'unknown'] ?? 1;
    const bOrder = order[b.botStatus || 'unknown'] ?? 1;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  const isBotNotInstalled = discord.error === 'bot_not_installed';

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString();
  };

  const getAvatarUrl = (user: DiscordMessage['author']): string => {
    if (user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`;
    }
    const discriminator = user.discriminator || '0';
    const defaultAvatarIndex = parseInt(discriminator) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
  };

  const getUserDisplayName = (user: DiscordMessage['author']): string => {
    return user.global_name || user.username;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Connection Status */}
      {discord.error && !isBotNotInstalled && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{discord.error}</span>
          </div>
          <button
            onClick={discord.reconnect}
            className="mt-2 px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {discord.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Discord...</span>
          </div>
        </div>
      )}

      {!discord.isConnected && !discord.isConnecting && !discord.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Discord to access your servers and channels
          </p>
          <button
            onClick={discord.connect}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Connect Discord
          </button>
        </div>
      )}

      {/* Server and Channel List */}
      {discord.isConnected && (
        <div className="flex-1 flex min-h-0">
          {/* Server/Channel Sidebar */}
          <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-y-auto">
            <div className="p-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Servers
              </h3>
              {sortedGuilds.map((guild) => (
                <div key={guild.id} className="mb-1">
                  <button
                    onClick={() => handleGuildSelect(guild)}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded text-left text-sm transition-colors',
                      discord.selectedGuild?.id === guild.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGuildExpansion(guild.id);
                      }}
                      className="p-0.5"
                    >
                      {expandedGuilds.has(guild.id) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    {guild.botStatus === 'full_access' ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Bot installed" />
                    ) : guild.botStatus === 'no_bot' ? (
                      <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    ) : null}
                    <span className="truncate">{guild.name}</span>
                    {guild.member_count && (
                      <Users className="w-3 h-3 ml-auto opacity-60" />
                    )}
                  </button>

                  {expandedGuilds.has(guild.id) && discord.selectedGuild?.id === guild.id && (
                    <div className="ml-4 mt-1 space-y-1">
                      {discord.channels.map((channel) => (
                        <button
                          key={channel.id}
                          onClick={() => handleChannelSelect(channel)}
                          className={cn(
                            'w-full flex items-center gap-2 p-1.5 rounded text-left text-sm transition-colors',
                            discord.selectedChannel?.id === channel.id
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                          )}
                        >
                          <Hash className="w-3 h-3" />
                          <span className="truncate">{channel.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {discord.selectedChannel ? (
              <>
                <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {discord.selectedChannel.name}
                    </span>
                  </div>
                  {discord.selectedChannel.topic && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {discord.selectedChannel.topic}
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {discord.hasMoreMessages && (
                    <div className="text-center py-2">
                      <button
                        onClick={() => discord.loadOlderMessages()}
                        disabled={discord.loadingMore}
                        className="px-4 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition disabled:opacity-50"
                      >
                        {discord.loadingMore ? (
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          'Load older messages'
                        )}
                      </button>
                    </div>
                  )}
                  {discord.messages.map((message) => (
                    <div key={message.id} className="flex gap-3">
                      <img
                        src={getAvatarUrl(message.author)}
                        alt={getUserDisplayName(message.author)}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {getUserDisplayName(message.author)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2">
                    <textarea
                      ref={inputRef}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message #${discord.selectedChannel.name}`}
                      className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[36px] max-h-32"
                      disabled={isSending}
                      rows={1}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || isSending}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center"
                      aria-label="Send message"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : isBotNotInstalled && discord.selectedGuild ? (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <div className="max-w-xs space-y-4">
                  <Lock className="w-10 h-10 text-gray-400 mx-auto" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    CacheGPT bot is not in this server
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    To browse channels and messages, ask a server admin to add the bot:
                  </p>
                  <button
                    onClick={() => handleCopyInviteLink(discord.selectedGuild!.id)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {copiedGuildId === discord.selectedGuild.id ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Invite Link
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    The bot only requests permission to view channels and read message history.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-4">
                <div>
                  <Hash className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Select a channel to start chatting
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
