'use client';

import { useState } from 'react';
import ChatInterface from '@/components/chat/ChatInterface'
import { DiscordProvider } from '@/contexts/DiscordContext'
import { GmailProvider } from '@/contexts/GmailContext'
import { CalendarProvider } from '@/contexts/CalendarContext'
import { SlackProvider } from '@/contexts/SlackContext'
import { NotionProvider } from '@/contexts/NotionContext'
import UnifiedIntegrationPanel, { IntegrationTab } from '@/components/chat/UnifiedIntegrationPanel'
import IntegrationDockButton from '@/components/chat/IntegrationDockButton'
import QuickReplyToast from '@/components/chat/QuickReplyToast'

function ChatPageWithDiscord(props: any) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<IntegrationTab>('discord');

  const handleOpenIntegration = (type: 'discord' | 'gmail') => {
    setActiveTab(type);
    setIsPanelOpen(true);
  };

  return (
    <DiscordProvider autoConnect={true}>
      <GmailProvider autoConnect={true}>
        <CalendarProvider autoConnect={true}>
          <SlackProvider autoConnect={true}>
            <NotionProvider autoConnect={true}>
              <div className="relative">
                <ChatInterface {...props} />
                <IntegrationDockButton
                  onClick={() => setIsPanelOpen(prev => !prev)}
                  isPanelOpen={isPanelOpen}
                />
                <UnifiedIntegrationPanel
                  isOpen={isPanelOpen}
                  onClose={() => setIsPanelOpen(false)}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
                <QuickReplyToast onOpenIntegration={handleOpenIntegration} />
              </div>
            </NotionProvider>
          </SlackProvider>
        </CalendarProvider>
      </GmailProvider>
    </DiscordProvider>
  )
}

export default ChatPageWithDiscord
