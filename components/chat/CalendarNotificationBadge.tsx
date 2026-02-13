'use client';

import React, { useState, useCallback } from 'react';
import { Calendar, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useCalendar } from '@/hooks/useCalendar';
import { cn } from '@/lib/utils';

interface CalendarNotificationBadgeProps {
  className?: string;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  autoConnect?: boolean;
}

export default function CalendarNotificationBadge({
  className,
  position = 'top-right',
  autoConnect = true,
}: CalendarNotificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const calendar = useCalendar({
    autoConnect,
    onError: (error) => {
      console.warn('[Calendar Badge] Connection error:', error);
    }
  });

  const handleClick = useCallback(() => {
    if (!calendar.isConnected && !calendar.isConnecting) {
      calendar.connect();
    } else {
      calendar.openPanel();
    }
  }, [calendar.isConnected, calendar.isConnecting, calendar.connect, calendar.openPanel]);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const getStatusInfo = () => {
    if (calendar.error) {
      return {
        text: `Calendar Error: ${calendar.error}`,
        color: 'text-red-600 dark:text-red-400'
      };
    }
    if (calendar.isConnecting) {
      return {
        text: 'Connecting to Calendar...',
        color: 'text-yellow-600 dark:text-yellow-400'
      };
    }
    if (calendar.isConnected) {
      const eventText = calendar.todayEventCount > 0
        ? `${calendar.todayEventCount} event${calendar.todayEventCount !== 1 ? 's' : ''} today`
        : 'No events today';
      return {
        text: `Connected - ${eventText}`,
        color: 'text-green-600 dark:text-green-400'
      };
    }
    return {
      text: 'Click to connect Calendar',
      color: 'text-gray-600 dark:text-gray-400'
    };
  };

  const statusInfo = getStatusInfo();
  const hasTodayEvents = calendar.hasTodayEvents;
  const eventCountDisplay = calendar.formatEventCount(calendar.todayEventCount);

  // Don't show badge if service is not connected
  if (!calendar.isConnected && !calendar.isConnecting) return null;

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
          'relative p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-500/50',
          'bg-blue-600 hover:bg-blue-700 text-white',
          'dark:bg-blue-500 dark:hover:bg-blue-600',
          calendar.isConnecting && 'opacity-75 cursor-wait'
        )}
        disabled={calendar.isConnecting}
        aria-label={
          calendar.isConnected
            ? `Calendar connected${hasTodayEvents ? ` - ${eventCountDisplay} events today` : ''}`
            : 'Connect to Calendar'
        }
      >
        <div className="relative">
          {calendar.error ? (
            <AlertCircle className="w-6 h-6" />
          ) : calendar.isConnecting ? (
            <WifiOff className="w-6 h-6 animate-spin" />
          ) : calendar.isConnected ? (
            <Calendar className="w-6 h-6" />
          ) : (
            <Wifi className="w-6 h-6" />
          )}
        </div>

        {/* Event count badge */}
        {hasTodayEvents && (
          <div className={cn(
            'absolute -top-2 -right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs font-bold shadow-md',
            'bg-yellow-500 text-white',
            'dark:bg-yellow-600 dark:text-white',
          )}>
            {eventCountDisplay}
          </div>
        )}

        {/* Connection indicator dot */}
        <div className={cn(
          'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 transition-colors',
          calendar.error ? 'bg-red-500' :
          calendar.isConnecting ? 'bg-yellow-500' :
          calendar.isConnected ? 'bg-green-500' : 'bg-gray-400'
        )} />
      </button>
    </div>
  );
}
