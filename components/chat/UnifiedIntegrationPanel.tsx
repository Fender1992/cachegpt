'use client';

import React, { useEffect } from 'react';
import {
  X,
  Pin,
  PinOff,
  MessageCircle,
  Mail,
  Calendar,
  MessageSquare,
  BookOpen,
  HardDrive,
  Bug,
  FolderOpen,
  Settings,
  Link2,
} from 'lucide-react';
import { useDiscord } from '@/hooks/useDiscord';
import { useGmail } from '@/hooks/useGmail';
import { useCalendar } from '@/hooks/useCalendar';
import { useSlack } from '@/hooks/useSlack';
import { useNotion } from '@/hooks/useNotion';
import { useDrive } from '@/hooks/useDrive';
import { useJira } from '@/hooks/useJira';
import DiscordPanelContent from './DiscordPanelContent';
import GmailPanelContent from './GmailPanelContent';
import CalendarPanelContent from './CalendarPanelContent';
import SlackPanelContent from './SlackPanelContent';
import NotionPanelContent from './NotionPanelContent';
import DrivePanelContent from './DrivePanelContent';
import JiraPanelContent from './JiraPanelContent';
import FilesPanelContent from './FilesPanelContent';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type IntegrationTab = 'discord' | 'gmail' | 'calendar' | 'slack' | 'notion' | 'drive' | 'jira' | 'files';

interface UnifiedIntegrationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: IntegrationTab;
  onTabChange: (tab: IntegrationTab) => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
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
  drive: {
    icon: HardDrive,
    label: 'Drive',
    activeText: 'text-green-600 dark:text-green-400',
    activeBorder: 'border-green-600 dark:border-green-400',
    badgeBg: 'bg-green-500',
  },
  jira: {
    icon: Bug,
    label: 'Jira',
    activeText: 'text-blue-600 dark:text-blue-400',
    activeBorder: 'border-blue-600 dark:border-blue-400',
    badgeBg: 'bg-blue-500',
  },
  files: {
    icon: FolderOpen,
    label: 'Files',
    activeText: 'text-orange-600 dark:text-orange-400',
    activeBorder: 'border-orange-600 dark:border-orange-400',
    badgeBg: 'bg-orange-500',
  },
} as const;

const TAB_ORDER: IntegrationTab[] = ['discord', 'gmail', 'calendar', 'slack', 'notion', 'drive', 'jira', 'files'];

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
  isPinned = false,
  onTogglePin,
}: UnifiedIntegrationPanelProps) {
  const discord = useDiscord();
  const gmail = useGmail();
  const calendar = useCalendar();
  const slack = useSlack();
  const notion = useNotion();
  const drive = useDrive();
  const jira = useJira();

  const integrationState: Record<IntegrationTab, { isConnected: boolean; isConnecting: boolean; error: string | null; count: number }> = {
    discord: { isConnected: discord.isConnected, isConnecting: discord.isConnecting, error: discord.error, count: discord.unreadCount },
    gmail: { isConnected: gmail.isConnected, isConnecting: gmail.isConnecting, error: gmail.error, count: gmail.unreadCount },
    calendar: { isConnected: calendar.isConnected, isConnecting: calendar.isConnecting, error: calendar.error, count: calendar.todayEventCount },
    slack: { isConnected: slack.isConnected, isConnecting: slack.isConnecting, error: slack.error, count: slack.unreadCount },
    notion: { isConnected: notion.isConnected, isConnecting: notion.isConnecting, error: notion.error, count: 0 },
    drive: { isConnected: drive.isConnected, isConnecting: drive.isConnecting, error: drive.error, count: 0 },
    jira: { isConnected: jira.isConnected, isConnecting: jira.isConnecting, error: jira.error, count: 0 },
    files: { isConnected: true, isConnecting: false, error: null, count: 0 }, // Always visible
  };

  // Show tabs for connected/connecting integrations + always show files
  const visibleTabs = TAB_ORDER.filter((tab) => {
    if (tab === 'files') return true; // Files tab is always visible
    const state = integrationState[tab];
    return state.isConnected || state.isConnecting;
  });

  // Auto-switch to first visible tab if current tab is no longer visible
  useEffect(() => {
    if (isOpen && visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      onTabChange(visibleTabs[0]);
    }
  }, [isOpen, visibleTabs, activeTab, onTabChange]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — hidden when pinned */}
      {!isPinned && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={cn(
        'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col transform transition-all duration-300 ease-in-out',
        isPinned
          ? 'fixed top-[85px] right-0 h-[calc(100%-85px)] w-[28rem] max-w-[40vw] border-l z-30'
          : 'fixed inset-0 sm:inset-auto sm:top-[85px] sm:right-0 sm:h-[calc(100%-85px-4rem)] sm:w-[28rem] sm:max-w-[85vw] sm:border-l sm:border-b z-50 sm:rounded-bl-xl'
      )} style={{ paddingTop: isPinned ? undefined : 'env(safe-area-inset-top)', paddingBottom: isPinned ? undefined : 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Integrations
          </h2>
          <div className="flex items-center gap-1">
            {onTogglePin && (
              <button
                onClick={onTogglePin}
                className={cn(
                  'p-1.5 transition-colors hidden sm:block',
                  isPinned
                    ? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                )}
                aria-label={isPinned ? 'Unpin panel' : 'Pin panel open'}
                title={isPinned ? 'Unpin panel' : 'Pin panel open'}
              >
                {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close integrations panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Empty state when no integrations are connected */}
        {visibleTabs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-xs">
              <Link2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                No integrations connected
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Connect your accounts in Settings to access Discord, Gmail, Slack, and more right from chat.
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                Go to Settings
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Bar — only connected integrations */}
            <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {visibleTabs.map((tab) => {
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
                    <span>{config.label}</span>
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

            {/* Content Area — only render connected panels */}
            <div className="flex-1 min-h-0 relative">
              {visibleTabs.includes('discord') && (
                <div className={cn('absolute inset-0', activeTab !== 'discord' && 'hidden')}>
                  <DiscordPanelContent isActive={activeTab === 'discord'} />
                </div>
              )}
              {visibleTabs.includes('gmail') && (
                <div className={cn('absolute inset-0', activeTab !== 'gmail' && 'hidden')}>
                  <GmailPanelContent isActive={activeTab === 'gmail'} />
                </div>
              )}
              {visibleTabs.includes('calendar') && (
                <div className={cn('absolute inset-0', activeTab !== 'calendar' && 'hidden')}>
                  <CalendarPanelContent isActive={activeTab === 'calendar'} />
                </div>
              )}
              {visibleTabs.includes('slack') && (
                <div className={cn('absolute inset-0', activeTab !== 'slack' && 'hidden')}>
                  <SlackPanelContent isActive={activeTab === 'slack'} />
                </div>
              )}
              {visibleTabs.includes('notion') && (
                <div className={cn('absolute inset-0', activeTab !== 'notion' && 'hidden')}>
                  <NotionPanelContent isActive={activeTab === 'notion'} />
                </div>
              )}
              {visibleTabs.includes('drive') && (
                <div className={cn('absolute inset-0', activeTab !== 'drive' && 'hidden')}>
                  <DrivePanelContent isActive={activeTab === 'drive'} />
                </div>
              )}
              {visibleTabs.includes('jira') && (
                <div className={cn('absolute inset-0', activeTab !== 'jira' && 'hidden')}>
                  <JiraPanelContent isActive={activeTab === 'jira'} />
                </div>
              )}
              <div className={cn('absolute inset-0', activeTab !== 'files' && 'hidden')}>
                <FilesPanelContent isActive={activeTab === 'files'} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
