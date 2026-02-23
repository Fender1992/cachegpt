'use client'

import { useState, useMemo } from 'react'
import { Search, Trash2, X, LogIn } from 'lucide-react'
import { isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns'
import ConversationList from './ConversationList'

interface Conversation {
  conversation_id: string
  title: string
  message_count: number
  provider: string
  last_message_at: string
}

interface ConversationSidebarProps {
  conversations: Conversation[]
  currentConversationId: string | null
  isAnonymous: boolean
  isOpen: boolean
  onClose: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string, event: React.MouseEvent) => void
  onLogin: () => void
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

export default function ConversationSidebar({
  conversations,
  currentConversationId,
  isAnonymous,
  isOpen,
  onClose,
  onSelectConversation,
  onDeleteConversation,
  onLogin,
}: ConversationSidebarProps) {
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

  if (!isOpen) return null

  return (
    <>
      {/* Desktop sidebar — uses shared ConversationList */}
      <div className="hidden sm:flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full animate-slide-in-left flex-shrink-0">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">History</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          isAnonymous={isAnonymous}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onLogin={onLogin}
        />
      </div>

      {/* Mobile bottom sheet — kept inline for different UX (provider names, close on select) */}
      <div className="sm:hidden fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl animate-slide-up" style={{ maxHeight: '70vh' }}>
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">History</h2>
              <button onClick={onClose} className="p-1 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
          <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: 'calc(70vh - 120px)' }}>
            {isAnonymous ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Sign in to save chat history</p>
                <button
                  onClick={onLogin}
                  className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium mx-auto"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
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
                        className={`relative group rounded-md transition-colors ${
                          currentConversationId === conv.conversation_id
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <button
                          onClick={() => {
                            onSelectConversation(conv.conversation_id)
                            onClose()
                          }}
                          className="w-full text-left px-3 py-2.5 pr-10 touch-manipulation"
                        >
                          <div className="text-sm text-gray-900 dark:text-white truncate">{conv.title}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {providerNames[conv.provider] || conv.provider} &middot; {getRelativeTime(conv.last_message_at)}
                          </div>
                        </button>
                        <button
                          onClick={(e) => onDeleteConversation(conv.conversation_id, e)}
                          className="absolute top-2.5 right-2.5 p-1.5 text-gray-400 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </>
  )
}
