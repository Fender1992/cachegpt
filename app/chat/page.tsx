import ChatInterface from '@/components/chat/ChatInterface'
import { DiscordProvider } from '@/contexts/DiscordContext'
import { GmailProvider } from '@/contexts/GmailContext'
import { CalendarProvider } from '@/contexts/CalendarContext'
import DiscordNotificationBadge from '@/components/chat/DiscordNotificationBadge'
import GmailNotificationBadge from '@/components/chat/GmailNotificationBadge'
import CalendarNotificationBadge from '@/components/chat/CalendarNotificationBadge'
import DiscordPanel from '@/components/chat/DiscordPanel'
import GmailPanel from '@/components/chat/GmailPanel'
import CalendarPanel from '@/components/chat/CalendarPanel'
import QuickReplyToast from '@/components/chat/QuickReplyToast'

function ChatPageWithDiscord(props: any) {
  return (
    <DiscordProvider autoConnect={true}>
      <GmailProvider autoConnect={true}>
        <CalendarProvider autoConnect={true}>
          <div className="relative">
            <ChatInterface {...props} />
            <DiscordNotificationBadge position="bottom-right" />
            <GmailNotificationBadge position="bottom-left" />
            <CalendarNotificationBadge position="top-right" />
            <DiscordPanel />
            <GmailPanel />
            <CalendarPanel />
            <QuickReplyToast />
          </div>
        </CalendarProvider>
      </GmailProvider>
    </DiscordProvider>
  )
}

export default ChatPageWithDiscord
