import ChatInterface from '@/components/chat/ChatInterface'
import { DiscordProvider } from '@/contexts/DiscordContext'
import { GmailProvider } from '@/contexts/GmailContext'
import { CalendarProvider } from '@/contexts/CalendarContext'
import { SlackProvider } from '@/contexts/SlackContext'
import { NotionProvider } from '@/contexts/NotionContext'
import DiscordNotificationBadge from '@/components/chat/DiscordNotificationBadge'
import GmailNotificationBadge from '@/components/chat/GmailNotificationBadge'
import CalendarNotificationBadge from '@/components/chat/CalendarNotificationBadge'
import SlackNotificationBadge from '@/components/chat/SlackNotificationBadge'
import NotionNotificationBadge from '@/components/chat/NotionNotificationBadge'
import DiscordPanel from '@/components/chat/DiscordPanel'
import GmailPanel from '@/components/chat/GmailPanel'
import CalendarPanel from '@/components/chat/CalendarPanel'
import SlackPanel from '@/components/chat/SlackPanel'
import NotionPanel from '@/components/chat/NotionPanel'
import QuickReplyToast from '@/components/chat/QuickReplyToast'

function ChatPageWithDiscord(props: any) {
  return (
    <DiscordProvider autoConnect={true}>
      <GmailProvider autoConnect={true}>
        <CalendarProvider autoConnect={true}>
          <SlackProvider autoConnect={true}>
            <NotionProvider autoConnect={true}>
              <div className="relative">
                <ChatInterface {...props} />
                <DiscordNotificationBadge position="bottom-right" />
                <GmailNotificationBadge position="bottom-left" />
                <CalendarNotificationBadge position="top-right" />
                <SlackNotificationBadge position="top-left" />
                <NotionNotificationBadge position="top-left" className="mt-16" />
                <DiscordPanel />
                <GmailPanel />
                <CalendarPanel />
                <SlackPanel />
                <NotionPanel />
                <QuickReplyToast />
              </div>
            </NotionProvider>
          </SlackProvider>
        </CalendarProvider>
      </GmailProvider>
    </DiscordProvider>
  )
}

export default ChatPageWithDiscord
