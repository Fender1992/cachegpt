'use client';

import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { useGmail } from '@/hooks/useGmail';
import { useCalendar } from '@/hooks/useCalendar';
import { useSlack } from '@/hooks/useSlack';
import { useNotion } from '@/hooks/useNotion';
import { useDrive } from '@/hooks/useDrive';
import { useJira } from '@/hooks/useJira';
import { cn } from '@/lib/utils';

interface IntegrationDockButtonProps {
  onClick: () => void;
  isPanelOpen: boolean;
  isHistoryOpen?: boolean;
}

export default function IntegrationDockButton({ onClick, isPanelOpen, isHistoryOpen }: IntegrationDockButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const discord = useDiscord();
  const gmail = useGmail();
  const calendar = useCalendar();
  const slack = useSlack();
  const notion = useNotion();
  const drive = useDrive();
  const jira = useJira();

  const integrations = [
    { name: 'Discord', isConnected: discord.isConnected, isConnecting: discord.isConnecting, error: discord.error, count: discord.unreadCount },
    { name: 'Gmail', isConnected: gmail.isConnected, isConnecting: gmail.isConnecting, error: gmail.error, count: gmail.unreadCount },
    { name: 'Calendar', isConnected: calendar.isConnected, isConnecting: calendar.isConnecting, error: calendar.error, count: calendar.todayEventCount },
    { name: 'Slack', isConnected: slack.isConnected, isConnecting: slack.isConnecting, error: slack.error, count: slack.unreadCount },
    { name: 'Notion', isConnected: notion.isConnected, isConnecting: notion.isConnecting, error: notion.error, count: 0 },
    { name: 'Drive', isConnected: drive.isConnected, isConnecting: drive.isConnecting, error: drive.error, count: 0 },
    { name: 'Jira', isConnected: jira.isConnected, isConnecting: jira.isConnecting, error: jira.error, count: 0 },
  ];

  const connectedCount = integrations.filter(i => i.isConnected).length;
  const hasConnecting = integrations.some(i => i.isConnecting);
  const hasError = integrations.some(i => i.error);
  const totalNotifications = integrations.reduce((sum, i) => sum + (i.count || 0), 0);

  // Always show the button — Files tab is always available

  // Determine overall status dot color
  let statusDotClass = 'bg-green-500';
  if (hasError) statusDotClass = 'bg-red-500';
  else if (hasConnecting && connectedCount === 0) statusDotClass = 'bg-yellow-500';

  return (
    <div className={cn(
      'fixed bottom-20 sm:bottom-4 z-[55] transition-all duration-300',
      isHistoryOpen ? 'right-4 sm:right-[22rem]' : 'right-4'
    )}>
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          'relative w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all',
          isPanelOpen
            ? 'bg-indigo-700 text-white'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-xl'
        )}
        aria-label="Toggle integrations panel"
      >
        <LayoutGrid className="w-5 h-5" />

        {/* Status dot */}
        <span className={cn(
          'absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900',
          statusDotClass
        )} />

        {/* Aggregate unread badge */}
        {totalNotifications > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[20px] h-5 flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && !isPanelOpen && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg whitespace-nowrap">
          <div className="font-medium">{connectedCount} connected</div>
          {totalNotifications > 0 && (
            <div className="text-gray-300">{totalNotifications} notification{totalNotifications !== 1 ? 's' : ''}</div>
          )}
          <div className="absolute bottom-0 right-4 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900 dark:bg-gray-700" />
        </div>
      )}
    </div>
  );
}
