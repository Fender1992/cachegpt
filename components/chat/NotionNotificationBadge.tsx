'use client';

import React, { useState, useCallback } from 'react';
import { BookOpen, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useNotion } from '@/hooks/useNotion';
import { cn } from '@/lib/utils';

interface NotionNotificationBadgeProps {
  className?: string;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  autoConnect?: boolean;
}

export default function NotionNotificationBadge({
  className,
  position = 'top-left',
  autoConnect = true,
}: NotionNotificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const notion = useNotion({
    autoConnect,
    onError: (error) => {
      console.warn('[Notion Badge] Connection error:', error);
    }
  });

  const handleClick = useCallback(() => {
    if (!notion.isConnected && !notion.isConnecting) {
      notion.connect();
    } else {
      notion.openPanel();
    }
  }, [notion.isConnected, notion.isConnecting, notion.connect, notion.openPanel]);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const getStatusInfo = () => {
    if (notion.error) {
      return {
        text: `Notion Error: ${notion.error}`,
        color: 'text-red-600 dark:text-red-400'
      };
    }
    if (notion.isConnecting) {
      return {
        text: 'Connecting to Notion...',
        color: 'text-yellow-600 dark:text-yellow-400'
      };
    }
    if (notion.isConnected) {
      return {
        text: `Connected to ${notion.workspaceName}`,
        color: 'text-green-600 dark:text-green-400'
      };
    }
    return {
      text: 'Click to connect to Notion',
      color: 'text-gray-600 dark:text-gray-400'
    };
  };

  const statusInfo = getStatusInfo();

  // Don't show badge if service is not connected
  if (!notion.isConnected && !notion.isConnecting) return null;

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
          'relative p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-gray-500/50',
          'bg-gray-900 hover:bg-gray-800 text-white',
          'dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-900',
          notion.isConnecting && 'opacity-75 cursor-wait'
        )}
        disabled={notion.isConnecting}
        aria-label={
          notion.isConnected
            ? `Notion connected to ${notion.workspaceName}`
            : 'Connect to Notion'
        }
      >
        <div className="relative">
          {notion.error ? (
            <AlertCircle className="w-6 h-6" />
          ) : notion.isConnecting ? (
            <WifiOff className="w-6 h-6 animate-spin" />
          ) : notion.isConnected ? (
            <BookOpen className="w-6 h-6" />
          ) : (
            <Wifi className="w-6 h-6" />
          )}
        </div>

        {/* Connection indicator dot */}
        <div className={cn(
          'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 transition-colors',
          notion.error ? 'bg-red-500' :
          notion.isConnecting ? 'bg-yellow-500' :
          notion.isConnected ? 'bg-green-500' : 'bg-gray-400'
        )} />
      </button>
    </div>
  );
}
