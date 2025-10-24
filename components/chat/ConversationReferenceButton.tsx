'use client'

import { useState } from 'react'
import { MessageSquare, X, ChevronRight } from 'lucide-react'

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count?: number
}

interface ConversationReferenceButtonProps {
  conversations: Conversation[]
  onReferenceSelect: (conversationId: string, title: string) => void
  disabled?: boolean
}

export default function ConversationReferenceButton({
  conversations,
  onReferenceSelect,
  disabled = false
}: ConversationReferenceButtonProps) {
  const [showModal, setShowModal] = useState(false)

  const handleSelect = (conversation: Conversation) => {
    onReferenceSelect(conversation.id, conversation.title)
    setShowModal(false)
  }

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={disabled || conversations.length === 0}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Reference another conversation"
        aria-label="Reference another conversation"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Reference a Conversation
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Select a previous conversation to include its context
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto p-4">
              {conversations.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No conversations available to reference
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      onClick={() => handleSelect(conversation)}
                      className="w-full p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-left group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-white truncate">
                            {conversation.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {getRelativeTime(conversation.updated_at)}
                            </span>
                            {conversation.message_count && (
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {conversation.message_count} messages
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors flex-shrink-0 ml-4" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Referenced conversation messages will be included in your current chat context
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
