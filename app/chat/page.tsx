import ChatInterface from '@/components/chat/ChatInterface'
import { DiscordProvider } from '@/contexts/DiscordContext'
import DiscordNotificationBadge from '@/components/chat/DiscordNotificationBadge'
import DiscordPanel from '@/components/chat/DiscordPanel'

function ChatPageWithDiscord(props: any) {
  return (
    <DiscordProvider autoConnect={true}>
      <div className="relative">
        <ChatInterface {...props} />
        <DiscordNotificationBadge position="bottom-right" />
        <DiscordPanel />
      </div>
    </DiscordProvider>
  )
}

export default ChatPageWithDiscord
