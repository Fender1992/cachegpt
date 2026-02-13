import ChatInterface from '@/components/chat/ChatInterface'
import { DiscordProvider } from '@/contexts/DiscordContext'
import { GmailProvider } from '@/contexts/GmailContext'
import DiscordNotificationBadge from '@/components/chat/DiscordNotificationBadge'
import GmailNotificationBadge from '@/components/chat/GmailNotificationBadge'
import DiscordPanel from '@/components/chat/DiscordPanel'
import GmailPanel from '@/components/chat/GmailPanel'
import QuickReplyToast from '@/components/chat/QuickReplyToast'

function ChatPageWithDiscord(props: any) {
  return (
    <DiscordProvider autoConnect={true}>
      <GmailProvider autoConnect={true}>
        <div className="relative">
          <ChatInterface {...props} />
          <DiscordNotificationBadge position="bottom-right" />
          <GmailNotificationBadge position="bottom-left" />
          <DiscordPanel />
          <GmailPanel />
          <QuickReplyToast />
        </div>
      </GmailProvider>
    </DiscordProvider>
  )
}

export default ChatPageWithDiscord
