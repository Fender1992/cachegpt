'use client'

import { useState, useMemo } from 'react'
import { Search, Trash2, LogIn } from 'lucide-react'
import { isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns'

export interface Conversation {
  conversation_id: string
  title: string
  message_count: number
  provider: string
  last_message_at: string
}

export interface ConversationListProps {
  conversations: Conversation[]
  currentConversationId: string | null
  isAnonymous: boolean
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string, event: React.MouseEvent) => void
  onLogin: () => void
  /** Whether to close parent on selection (used by mobile bottom sheet) */
  onCloseAfterSelect?: () => void
  /** Compact mode for collapsed sidebar */
  compact?: boolean
}

const providerNames: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
}

function getRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`

  return date.toLocaleDateString('en-US', {
    timeZone: userTimezone,
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

type TimeGroup = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older'

function getTimeGroup(dateString: string): TimeGroup {
  const date = new Date(dateString)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isThisWeek(date)) return 'This Week'
  if (isThisMonth(date)) return 'This Month'
  return 'Older'
}

const groupOrder: TimeGroup[] = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

export default function ConversationList({
  conversations,
  currentConversationId,
  isAnonymous,
  onSelectConversation,
  onDeleteConversation,
  onLogin,
  onCloseAfterSelect,
  compact,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, searchQuery])

  const groupedConversations = useMemo(() => {
    const groups: Record<TimeGroup, Conversation[]> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      'This Month': [],
      Older: [],
    }
    for (const conv of filteredConversations) {
      const group = getTimeGroup(conv.last_message_at)
      groups[group].push(conv)
    }
    return groups
  }, [filteredConversations])

  if (compact) return null

  return (
    <>
      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {isAnonymous ? (
          <div className="text-center py-8 px-3">
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-3">Sign in to save chat history</p>
            <button
              onClick={onLogin}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors mx-auto"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
          </div>
        ) : filteredConversations.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-xs text-center py-8">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </p>
        ) : (
          groupOrder.map((group) => {
            const convs = groupedConversations[group]
            if (convs.length === 0) return null
            return (
              <div key={group}>
                <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group}
                </div>
                {convs.map((conv) => (
                  <div
                    key={conv.conversation_id}
                    className={`relative group rounded-md transition-colors cursor-pointer ${
                      currentConversationId === conv.conversation_id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectConversation(conv.conversation_id)
                        onCloseAfterSelect?.()
                      }}
                      className="w-full text-left px-2.5 py-2 pr-8"
                    >
                      <div className="text-sm text-gray-900 dark:text-white truncate">{conv.title}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {getRelativeTime(conv.last_message_at)}
                      </div>
                    </button>
                    <button
                      onClick={(e) => onDeleteConversation(conv.conversation_id, e)}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
