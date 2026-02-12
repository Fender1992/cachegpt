'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Hash, 
  Users, 
  Send, 
  Loader2, 
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Settings
} from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { DiscordMessage, DiscordGuild, DiscordChannel } from '@/lib/discord/discord-gateway';
import { cn } from '@/lib/utils';

interface DiscordPanelProps {
  className?: string;
}

export default function DiscordPanel({ className }: DiscordPanelProps) {
  const discord = useDiscord();
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [expandedGuilds, setExpandedGuilds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [discord.messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (discord.isPanelOpen && discord.canSendMessages) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [discord.isPanelOpen, discord.canSendMessages]);

  // Handle guild expansion
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

  // Handle guild selection
  const handleGuildSelect = useCallback(async (guild: DiscordGuild) => {
    if (guild.id === discord.selectedGuild?.id) return;
    
    await discord.selectGuild(guild);
    setExpandedGuilds(prev => new Set(prev).add(guild.id));
  }, [discord.selectGuild, discord.selectedGuild]);

  // Handle channel selection
  const handleChannelSelect = useCallback(async (channel: DiscordChannel) => {
    if (channel.id === discord.selectedChannel?.id) return;
    
    await discord.selectChannel(channel);
  }, [discord.selectChannel, discord.selectedChannel]);

  // Handle message sending
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

  // Handle input key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  // Format timestamp for messages
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

  // Get avatar URL for Discord user
  const getAvatarUrl = (user: DiscordMessage['author']): string => {
    if (user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`;
    }
    // Default Discord avatar
    const discriminator = user.discriminator || '0';
    const defaultAvatarIndex = parseInt(discriminator) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
  };

  // Get display name for user
  const getUserDisplayName = (user: DiscordMessage['author']): string => {
    return user.global_name || user.username;
  };

  if (!discord.isPanelOpen) return null;

  return (
    <div className={cn(
      'fixed top-0 right-0 h-full w-96 max-w-[90vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col',
      'transform transition-transform duration-300 ease-in-out',
      className
    )}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Discord
          </h2>
          {discord.isConnected && discord.userDisplayName && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              as {discord.userDisplayName}
            </span>
          )}
        </div>
        <button
          onClick={discord.closePanel}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close Discord panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Connection Status */}
      {discord.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{discord.error}</span>
          </div>
          <button
            onClick={discord.connect}
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
        <div className="flex-1 flex">
          {/* Server/Channel Sidebar */}
          <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-y-auto">
            <div className="p-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Servers
              </h3>
              {discord.guilds.map((guild) => (
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
                    <span className="truncate">{guild.name}</span>
                    {guild.member_count && (
                      <Users className="w-3 h-3 ml-auto opacity-60" />
                    )}
                  </button>

                  {/* Channels for expanded guild */}
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
          <div className="flex-1 flex flex-col">
            {discord.selectedChannel ? (
              <>
                {/* Channel Header */}
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

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
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

                {/* Message Input */}
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