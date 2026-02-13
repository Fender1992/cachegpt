'use client';

import React, { useState, useCallback } from 'react';
import { Mail, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { cn } from '@/lib/utils';

interface GmailNotificationBadgeProps {
  className?: string;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  autoConnect?: boolean;
}

export default function GmailNotificationBadge({
  className,
  position = 'bottom-left',
  autoConnect = true,
}: GmailNotificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const gmail = useGmail({
    autoConnect,
    onError: (error) => {
      console.warn('[Gmail Badge] Connection error:', error);
    }
  });

  const handleClick = useCallback(() => {
    if (!gmail.isConnected && !gmail.isConnecting) {
      gmail.connect();
    } else {
      gmail.openPanel();
    }
  }, [gmail.isConnected, gmail.isConnecting, gmail.connect, gmail.openPanel]);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const getStatusInfo = () => {
    if (gmail.error) {
      return {
        text: `Gmail Error: ${gmail.error}`,
        color: 'text-red-600 dark:text-red-400'
      };
    }
    if (gmail.isConnecting) {
      return {
        text: 'Connecting to Gmail...',
        color: 'text-yellow-600 dark:text-yellow-400'
      };
    }
    if (gmail.isConnected) {
      return {
        text: `Connected as ${gmail.email}`,
        color: 'text-green-600 dark:text-green-400'
      };
    }
    return {
      text: 'Click to connect to Gmail',
      color: 'text-gray-600 dark:text-gray-400'
    };
  };

  const statusInfo = getStatusInfo();
  const hasUnread = gmail.hasUnread;
  const unreadDisplay = gmail.formatUnreadCount(gmail.unreadCount);

  // Don't show badge if service is not connected
  if (!gmail.isConnected && !gmail.isConnecting) return null;

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
          {gmail.selectedLabel && (
            <div className="text-xs mt-1 text-gray-300 dark:text-gray-600">
              {gmail.selectedLabel.name}
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
          'relative p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-red-500/50',
          'bg-red-600 hover:bg-red-700 text-white',
          'dark:bg-red-500 dark:hover:bg-red-600',
          hasUnread && 'animate-pulse',
          gmail.isConnecting && 'opacity-75 cursor-wait'
        )}
        disabled={gmail.isConnecting}
        aria-label={
          gmail.isConnected
            ? `Gmail connected${hasUnread ? ` - ${unreadDisplay} unread emails` : ''}`
            : 'Connect to Gmail'
        }
      >
        <div className="relative">
          {gmail.error ? (
            <AlertCircle className="w-6 h-6" />
          ) : gmail.isConnecting ? (
            <WifiOff className="w-6 h-6 animate-spin" />
          ) : gmail.isConnected ? (
            <Mail className="w-6 h-6" />
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
          gmail.error ? 'bg-red-500' :
          gmail.isConnecting ? 'bg-yellow-500' :
          gmail.isConnected ? 'bg-green-500' : 'bg-gray-400'
        )} />

        {/* Ripple effect on unread */}
        {hasUnread && (
          <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
        )}
      </button>
    </div>
  );
}
