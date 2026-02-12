'use client';

import React, { useState, useCallback } from 'react';
import { MessageCircle, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { cn } from '@/lib/utils';

interface DiscordNotificationBadgeProps {
  className?: string;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  autoConnect?: boolean;
}

export default function DiscordNotificationBadge({
  className,
  position = 'bottom-right',
  autoConnect = true,
}: DiscordNotificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const discord = useDiscord({
    autoConnect,
    onError: (error) => {
      console.warn('[Discord Badge] Connection error:', error);
    }
  });

  const handleClick = useCallback(() => {
    if (!discord.isConnected && !discord.isConnecting) {
      discord.connect();
    } else {
      discord.openPanel();
    }
  }, [discord.isConnected, discord.isConnecting, discord.connect, discord.openPanel]);

  // Position classes for fixed positioning
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  };

  // Get status info for tooltip
  const getStatusInfo = () => {
    if (discord.error) {
      return { 
        text: `Discord Error: ${discord.error}`, 
        color: 'text-red-600 dark:text-red-400' 
      };
    }
    if (discord.isConnecting) {
      return { 
        text: 'Connecting to Discord...', 
        color: 'text-yellow-600 dark:text-yellow-400' 
      };
    }
    if (discord.isConnected) {
      return { 
        text: `Connected as ${discord.userDisplayName}`, 
        color: 'text-green-600 dark:text-green-400' 
      };
    }
    return { 
      text: 'Click to connect to Discord', 
      color: 'text-gray-600 dark:text-gray-400' 
    };
  };

  const statusInfo = getStatusInfo();
  const hasUnread = discord.hasUnreadMessages;
  const unreadDisplay = discord.formatUnreadCount(discord.unreadCount);

  return (
    <div 
      className={cn(
        'fixed z-50 transition-all duration-300',
        positionClasses[position],
        className
      )}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-lg whitespace-nowrap shadow-lg">
          <div className={statusInfo.color}>
            {statusInfo.text}
          </div>
          {discord.selectedGuild && discord.selectedChannel && (
            <div className="text-xs mt-1 text-gray-300 dark:text-gray-600">
              #{discord.selectedChannel.name} in {discord.selectedGuild.name}
            </div>
          )}
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-100 rotate-45"></div>
        </div>
      )}

      {/* Main button */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={cn(
          'relative p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-500/50',
          // Base colors
          'bg-blue-600 hover:bg-blue-700 text-white',
          // Dark mode
          'dark:bg-blue-500 dark:hover:bg-blue-600',
          // Animation
          hasUnread && 'animate-pulse',
          // Disabled state
          discord.isConnecting && 'opacity-75 cursor-wait'
        )}
        disabled={discord.isConnecting}
        aria-label={
          discord.isConnected 
            ? `Discord connected${hasUnread ? ` - ${unreadDisplay} unread messages` : ''}`
            : 'Connect to Discord'
        }
      >
        {/* Connection status icon */}
        <div className="relative">
          {discord.error ? (
            <AlertCircle className="w-6 h-6" />
          ) : discord.isConnecting ? (
            <WifiOff className="w-6 h-6 animate-spin" />
          ) : discord.isConnected ? (
            <MessageCircle className="w-6 h-6" />
          ) : (
            <Wifi className="w-6 h-6" />
          )}
        </div>

        {/* Unread message badge */}
        {hasUnread && (
          <div className={cn(
            'absolute -top-2 -right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs font-bold shadow-md',
            'bg-red-500 text-white',
            'dark:bg-red-600 dark:text-white',
            // Pulse animation for new messages
            'animate-bounce'
          )}>
            {unreadDisplay}
          </div>
        )}

        {/* Connection indicator dot */}
        <div className={cn(
          'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 transition-colors',
          discord.error ? 'bg-red-500' :
          discord.isConnecting ? 'bg-yellow-500' :
          discord.isConnected ? 'bg-green-500' : 'bg-gray-400'
        )} />

        {/* Ripple effect on new messages */}
        {hasUnread && (
          <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-30" />
        )}
      </button>
    </div>
  );
}