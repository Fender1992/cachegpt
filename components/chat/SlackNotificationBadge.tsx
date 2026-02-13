'use client';

import React, { useState, useCallback } from 'react';
import { MessageSquare, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useSlack } from '@/hooks/useSlack';
import { cn } from '@/lib/utils';

interface SlackNotificationBadgeProps {
  className?: string;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  autoConnect?: boolean;
}

export default function SlackNotificationBadge({
  className,
  position = 'top-left',
  autoConnect = true,
}: SlackNotificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const slack = useSlack({
    autoConnect,
    onError: (error) => {
      console.warn('[Slack Badge] Connection error:', error);
    }
  });

  const handleClick = useCallback(() => {
    if (!slack.isConnected && !slack.isConnecting) {
      slack.connect();
    } else {
      slack.openPanel();
    }
  }, [slack.isConnected, slack.isConnecting, slack.connect, slack.openPanel]);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const getStatusInfo = () => {
    if (slack.error) {
      return {
        text: `Slack Error: ${slack.error}`,
        color: 'text-red-600 dark:text-red-400'
      };
    }
    if (slack.isConnecting) {
      return {
        text: 'Connecting to Slack...',
        color: 'text-yellow-600 dark:text-yellow-400'
      };
    }
    if (slack.isConnected) {
      return {
        text: `Connected to ${slack.teamName}`,
        color: 'text-green-600 dark:text-green-400'
      };
    }
    return {
      text: 'Click to connect to Slack',
      color: 'text-gray-600 dark:text-gray-400'
    };
  };

  const statusInfo = getStatusInfo();
  const hasUnread = slack.hasUnread;
  const unreadDisplay = slack.formatUnreadCount(slack.unreadCount);

  // Don't show badge if service is not connected
  if (!slack.isConnected && !slack.isConnecting) return null;

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
          {slack.selectedChannel && (
            <div className="text-xs mt-1 text-gray-300 dark:text-gray-600">
              #{slack.selectedChannel.name}
            </div>
          )}
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
          'relative p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-purple-500/50',
          'bg-purple-600 hover:bg-purple-700 text-white',
          'dark:bg-purple-500 dark:hover:bg-purple-600',
          hasUnread && 'animate-pulse',
          slack.isConnecting && 'opacity-75 cursor-wait'
        )}
        disabled={slack.isConnecting}
        aria-label={
          slack.isConnected
            ? `Slack connected${hasUnread ? ` - ${unreadDisplay} unread messages` : ''}`
            : 'Connect to Slack'
        }
      >
        <div className="relative">
          {slack.error ? (
            <AlertCircle className="w-6 h-6" />
          ) : slack.isConnecting ? (
            <WifiOff className="w-6 h-6 animate-spin" />
          ) : slack.isConnected ? (
            <MessageSquare className="w-6 h-6" />
          ) : (
            <Wifi className="w-6 h-6" />
          )}
        </div>

        {/* Unread badge */}
        {hasUnread && (
          <div className={cn(
            'absolute -top-2 -right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs font-bold shadow-md',
            'bg-yellow-500 text-white',
            'dark:bg-yellow-600 dark:text-white',
            'animate-bounce'
          )}>
            {unreadDisplay}
          </div>
        )}

        {/* Connection indicator dot */}
        <div className={cn(
          'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 transition-colors',
          slack.error ? 'bg-red-500' :
          slack.isConnecting ? 'bg-yellow-500' :
          slack.isConnected ? 'bg-green-500' : 'bg-gray-400'
        )} />

        {/* Ripple effect on unread */}
        {hasUnread && (
          <div className="absolute inset-0 rounded-full bg-purple-400 animate-ping opacity-30" />
        )}
      </button>
    </div>
  );
}
