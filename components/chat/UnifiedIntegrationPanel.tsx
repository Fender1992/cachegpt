'use client';

import React from 'react';
import {
  X,
  MessageCircle,
  Mail,
  Calendar,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { useGmail } from '@/hooks/useGmail';
import { useYahoo } from '@/hooks/useYahoo';
import { useCalendar } from '@/hooks/useCalendar';
import { useSlack } from '@/hooks/useSlack';
import { useNotion } from '@/hooks/useNotion';
import DiscordPanelContent from './DiscordPanelContent';
import GmailPanelContent from './GmailPanelContent';
import YahooPanelContent from './YahooPanelContent';
import CalendarPanelContent from './CalendarPanelContent';
import SlackPanelContent from './SlackPanelContent';
import NotionPanelContent from './NotionPanelContent';
import { cn } from '@/lib/utils';

export type IntegrationTab = 'discord' | 'gmail' | 'yahoo' | 'calendar' | 'slack' | 'notion';

interface UnifiedIntegrationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: IntegrationTab;
  onTabChange: (tab: IntegrationTab) => void;
}

const TAB_CONFIG = {
  discord: {
    icon: MessageCircle,
    label: 'Discord',
    activeText: 'text-blue-600 dark:text-blue-400',
    activeBorder: 'border-blue-600 dark:border-blue-400',
    badgeBg: 'bg-blue-500',
  },
  gmail: {
    icon: Mail,
    label: 'Gmail',
    activeText: 'text-red-600 dark:text-red-400',
    activeBorder: 'border-red-600 dark:border-red-400',
    badgeBg: 'bg-red-500',
  },
  yahoo: {
    icon: Mail,
    label: 'Yahoo',
    activeText: 'text-purple-600 dark:text-purple-400',
    activeBorder: 'border-purple-600 dark:border-purple-400',
    badgeBg: 'bg-purple-500',
  },
  calendar: {
    icon: Calendar,
    label: 'Calendar',
    activeText: 'text-emerald-600 dark:text-emerald-400',
    activeBorder: 'border-emerald-600 dark:border-emerald-400',
    badgeBg: 'bg-emerald-500',
  },
  slack: {
    icon: MessageSquare,
    label: 'Slack',
    activeText: 'text-pink-600 dark:text-pink-400',
    activeBorder: 'border-pink-600 dark:border-pink-400',
    badgeBg: 'bg-pink-500',
  },
  notion: {
    icon: BookOpen,
    label: 'Notion',
    activeText: 'text-gray-800 dark:text-gray-200',
    activeBorder: 'border-gray-800 dark:border-gray-400',
    badgeBg: 'bg-gray-700',
  },
} as const;

const TAB_ORDER: IntegrationTab[] = ['discord', 'gmail', 'yahoo', 'calendar', 'slack', 'notion'];

function getStatusDot(isConnected: boolean, isConnecting: boolean, error: string | null): string {
  if (error) return 'bg-red-500';
  if (isConnecting) return 'bg-yellow-500';
  if (isConnected) return 'bg-green-500';
  return 'bg-gray-400';
}

export default function UnifiedIntegrationPanel({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
}: UnifiedIntegrationPanelProps) {
  const discord = useDiscord();
  const gmail = useGmail();
  const yahoo = useYahoo();
  const calendar = useCalendar();
  const slack = useSlack();
  const notion = useNotion();

  const integrationState = {
    discord: { isConnected: discord.isConnected, isConnecting: discord.isConnecting, error: discord.error, count: discord.unreadCount },
    gmail: { isConnected: gmail.isConnected, isConnecting: gmail.isConnecting, error: gmail.error, count: gmail.unreadCount },
    yahoo: { isConnected: yahoo.isConnected, isConnecting: yahoo.isConnecting, error: yahoo.error, count: yahoo.unreadCount },
    calendar: { isConnected: calendar.isConnected, isConnecting: calendar.isConnecting, error: calendar.error, count: calendar.todayEventCount },
    slack: { isConnected: slack.isConnected, isConnecting: slack.isConnecting, error: slack.error, count: slack.unreadCount },
    notion: { isConnected: notion.isConnected, isConnecting: notion.isConnecting, error: notion.error, count: 0 },
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-[85px] right-0 h-[calc(100%-85px-4rem)] w-[28rem] max-w-[85vw] bg-white dark:bg-gray-900 border-l border-b border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col rounded-bl-xl transform transition-transform duration-300 ease-in-out">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Integrations
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close integrations panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {TAB_ORDER.map((tab) => {
            const config = TAB_CONFIG[tab];
            const state = integrationState[tab];
            const Icon = config.icon;
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative',
                  isActive
                    ? cn(config.activeText, config.activeBorder)
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                <div className="relative">
                  <Icon className="w-4 h-4" />
                  {/* Connection status dot */}
                  <span className={cn(
                    'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full',
                    getStatusDot(state.isConnected, state.isConnecting, state.error)
                  )} />
                </div>
                <span className="hidden sm:inline">{config.label}</span>
                {/* Unread/event count badge */}
                {state.count > 0 && (
                  <span className={cn(
                    'text-[10px] leading-none px-1 py-0.5 rounded-full text-white font-medium',
                    config.badgeBg
                  )}>
                    {state.count > 99 ? '99+' : state.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Area - all mounted, hidden class toggles visibility */}
        <div className="flex-1 min-h-0 relative">
          <div className={cn('absolute inset-0', activeTab !== 'discord' && 'hidden')}>
            <DiscordPanelContent isActive={activeTab === 'discord'} />
          </div>
          <div className={cn('absolute inset-0', activeTab !== 'gmail' && 'hidden')}>
            <GmailPanelContent isActive={activeTab === 'gmail'} />
          </div>
          <div className={cn('absolute inset-0', activeTab !== 'yahoo' && 'hidden')}>
            <YahooPanelContent isActive={activeTab === 'yahoo'} />
          </div>
          <div className={cn('absolute inset-0', activeTab !== 'calendar' && 'hidden')}>
            <CalendarPanelContent isActive={activeTab === 'calendar'} />
          </div>
          <div className={cn('absolute inset-0', activeTab !== 'slack' && 'hidden')}>
            <SlackPanelContent isActive={activeTab === 'slack'} />
          </div>
          <div className={cn('absolute inset-0', activeTab !== 'notion' && 'hidden')}>
            <NotionPanelContent isActive={activeTab === 'notion'} />
          </div>
        </div>
      </div>
    </>
  );
}
