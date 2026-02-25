'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useIsDesktop } from '@/hooks/useIsDesktop'
import ChatInterface from '@/components/chat/ChatInterface'
import CommandPalette from '@/components/chat/CommandPalette'
import { DiscordProvider } from '@/contexts/DiscordContext'
import { GmailProvider } from '@/contexts/GmailContext'
import { CalendarProvider } from '@/contexts/CalendarContext'
import { SlackProvider } from '@/contexts/SlackContext'
import { TeamsProvider } from '@/contexts/TeamsContext'
import { NotionProvider } from '@/contexts/NotionContext'
import { DriveProvider } from '@/contexts/DriveContext'
import { JiraProvider } from '@/contexts/JiraContext'
import UnifiedIntegrationPanel, { IntegrationTab } from '@/components/chat/UnifiedIntegrationPanel'
import IntegrationDockButton from '@/components/chat/IntegrationDockButton'
import QuickReplyToast from '@/components/chat/QuickReplyToast'

function ChatPageWithDiscord(props: any) {
  const router = useRouter();
  const isDesktopApp = useIsDesktop();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isPanelPinned, setIsPanelPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<IntegrationTab>('discord');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [qualityMode, setQualityMode] = useState<'fast' | 'best'>('fast');

  // Restore pinned state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('integrationPanelPinned');
    if (saved === 'true') {
      setIsPanelPinned(true);
      setIsPanelOpen(true);
      const savedTab = localStorage.getItem('integrationPanelTab') as IntegrationTab | null;
      if (savedTab) setActiveTab(savedTab);
    }
  }, []);

  const handleTogglePin = () => {
    const newPinned = !isPanelPinned;
    setIsPanelPinned(newPinned);
    localStorage.setItem('integrationPanelPinned', String(newPinned));
    if (newPinned) {
      localStorage.setItem('integrationPanelTab', activeTab);
    }
  };

  const handleClose = () => {
    setIsPanelOpen(false);
    if (isPanelPinned) {
      setIsPanelPinned(false);
      localStorage.removeItem('integrationPanelPinned');
    }
  };

  const handleTabChange = (tab: IntegrationTab) => {
    setActiveTab(tab);
    if (isPanelPinned) {
      localStorage.setItem('integrationPanelTab', tab);
    }
  };

  const handleOpenIntegration = (type: 'discord' | 'gmail') => {
    setActiveTab(type);
    setIsPanelOpen(true);
  };

  // Command palette callbacks
  const handleNewChat = useCallback(() => {
    // Dispatch a custom event that ChatInterface listens for
    window.dispatchEvent(new CustomEvent('cachegpt:new-chat'));
  }, []);

  const handleSwitchProvider = useCallback((provider: string) => {
    setSelectedProvider(provider);
    window.dispatchEvent(new CustomEvent('cachegpt:switch-provider', { detail: { provider } }));
  }, []);

  const handleToggleQuality = useCallback(() => {
    setQualityMode(prev => {
      const next = prev === 'fast' ? 'best' : 'fast';
      window.dispatchEvent(new CustomEvent('cachegpt:toggle-quality', { detail: { mode: next } }));
      return next;
    });
  }, []);

  const handleOpenSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  return (
    <DiscordProvider autoConnect={!isDesktopApp}>
      <GmailProvider autoConnect={!isDesktopApp}>
        <CalendarProvider autoConnect={!isDesktopApp}>
          <SlackProvider autoConnect={!isDesktopApp}>
            <TeamsProvider autoConnect={!isDesktopApp}>
              <NotionProvider autoConnect={!isDesktopApp}>
                <DriveProvider autoConnect={!isDesktopApp}>
                  <JiraProvider autoConnect={!isDesktopApp}>
                    <div className={`relative ${isDesktopApp ? 'h-full' : 'h-dvh'}`}>
                      <ChatInterface {...props} onShowHistoryChange={setIsHistoryOpen} isPanelPinned={isPanelPinned && isPanelOpen} />
                      <IntegrationDockButton
                        onClick={() => setIsPanelOpen(prev => !prev)}
                        isPanelOpen={isPanelOpen}
                        isHistoryOpen={isHistoryOpen}
                      />
                      <UnifiedIntegrationPanel
                        isOpen={isPanelOpen}
                        onClose={handleClose}
                        activeTab={activeTab}
                        onTabChange={handleTabChange}
                        isPinned={isPanelPinned}
                        onTogglePin={handleTogglePin}
                      />
                      <QuickReplyToast onOpenIntegration={handleOpenIntegration} />
                      <CommandPalette
                        onNewChat={handleNewChat}
                        onSwitchProvider={handleSwitchProvider}
                        onToggleQuality={handleToggleQuality}
                        onOpenSettings={handleOpenSettings}
                        qualityMode={qualityMode}
                        selectedProvider={selectedProvider}
                      />
                    </div>
                  </JiraProvider>
                </DriveProvider>
              </NotionProvider>
            </TeamsProvider>
          </SlackProvider>
        </CalendarProvider>
      </GmailProvider>
    </DiscordProvider>
  )
}

export default ChatPageWithDiscord
