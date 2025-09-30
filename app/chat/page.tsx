'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Send, Bot, Brain, Sparkles, Zap, Settings, LogOut, History, RefreshCw, Loader2 } from 'lucide-react'
import BugReportButton from '@/components/bug-report-button'
import ProviderSelector from '@/components/provider-selector'
import { error as logError } from '@/lib/logger'

const providerIcons = {
  chatgpt: Bot,
  claude: Brain,
  gemini: Sparkles,
  perplexity: Zap
}

const providerNames = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity'
}

interface ChatMessage {
  role: string
  content: string
  provider?: string
  model?: string
  created_at?: string
  error?: boolean
  retryMessage?: string
}

// Maximum messages to keep in memory (prevents memory leaks in long sessions)
const MAX_MESSAGES_IN_MEMORY = 50

export default function ChatPage() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [conversations, setConversations] = useState<any[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('auto')
  const [isLoading, setIsLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [usingPremium, setUsingPremium] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return date.toLocaleDateString()
  }

  useEffect(() => {
    console.log('[CHAT] Page mounted, initializing...')
    loadUserProfile()
    loadUserPreferences()
    loadConversations()
  }, [])

  const loadUserPreferences = async () => {
    // No longer loading model preferences - system auto-selects best models
    // Provider selection handled by ProviderSelector component
  }

  const loadConversations = async () => {
    try {
      console.log('[CHAT] Loading conversations...')

      // Get user ID from current session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        console.warn('[CHAT] No session found, skipping conversations load')
        return
      }

      const userId = session.user.id
      console.log('[CHAT] Loading conversations for user:', userId)

      const response = await fetch(`/api/conversations?limit=20&platform=web&user_id=${userId}`, {
        credentials: 'include'
      })
      console.log('[CHAT] Conversations response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[CHAT] Conversations loaded:', data.conversations?.length || 0)
        setConversations(data.conversations || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('[CHAT] Failed to load conversations:', response.status, errorData)
      }
    } catch (error) {
      console.error('[CHAT] Exception loading conversations:', error)
      logError('Error loading conversations', error)
    }
  }

  const loadConversationMessages = async (conversationId: string, limit = MAX_MESSAGES_IN_MEMORY) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages?limit=${limit}`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        const loadedMessages = data.messages || []
        setMessages(loadedMessages)
        setHasOlderMessages(data.hasMore || false)
        setCurrentConversationId(conversationId)
        setShowHistory(false)
      }
    } catch (error) {
      logError('Error loading conversation messages', error)
    }
  }

  const loadOlderMessages = async () => {
    if (!currentConversationId || loadingOlderMessages || !hasOlderMessages) return

    setLoadingOlderMessages(true)
    try {
      const oldestMessage = messages[0]
      const response = await fetch(
        `/api/conversations/${currentConversationId}/messages?before=${oldestMessage?.created_at}&limit=20`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        const olderMessages = data.messages || []
        setMessages(prev => [...olderMessages, ...prev])
        setHasOlderMessages(data.hasMore || false)
      }
    } catch (error) {
      logError('Error loading older messages', error)
    } finally {
      setLoadingOlderMessages(false)
    }
  }

  // Handle mobile keyboard and viewport changes
  useEffect(() => {
    let initialViewportHeight = window.visualViewport?.height || window.innerHeight

    const handleViewportChange = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height
        const heightDifference = initialViewportHeight - currentHeight
        const keyboardOpen = heightDifference > 100

        setKeyboardVisible(keyboardOpen)

        // Prevent scrolling when keyboard opens/closes
        if (keyboardOpen) {
          // Keyboard opened - ensure input stays in view without bouncing
          requestAnimationFrame(() => {
            if (inputRef.current) {
              const inputRect = inputRef.current.getBoundingClientRect()
              const viewportHeight = window.visualViewport?.height || window.innerHeight

              // Only scroll if input is actually hidden
              if (inputRect.bottom > viewportHeight) {
                inputRef.current.scrollIntoView({
                  behavior: 'smooth',
                  block: 'end'
                })
              }
            }
          })
        }
      }
    }

    const handleScroll = () => {
      // Prevent unwanted scrolling during keyboard events
      if (keyboardVisible) {
        window.scrollTo(0, 0)
      }
    }

    const handleResize = () => {
      // Update initial height on orientation change
      setTimeout(() => {
        initialViewportHeight = window.visualViewport?.height || window.innerHeight
      }, 500)
    }

    // Modern approach using Visual Viewport API
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange)
      window.visualViewport.addEventListener('scroll', handleViewportChange)
    }

    // Prevent document scrolling when keyboard is visible
    window.addEventListener('scroll', handleScroll, { passive: false })
    window.addEventListener('resize', handleResize)

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange)
        window.visualViewport.removeEventListener('scroll', handleViewportChange)
      }
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [keyboardVisible])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea as user types
  useEffect(() => {
    if (inputRef.current) {
      // Reset height to auto to get the correct scrollHeight
      inputRef.current.style.height = 'auto'
      // Set height to scrollHeight (content height)
      const newHeight = Math.min(inputRef.current.scrollHeight, 200) // Max 200px
      inputRef.current.style.height = `${newHeight}px`
    }
  }, [message])

  const loadUserProfile = async () => {
    console.log('[CHAT] Loading user profile...')
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    console.log('[CHAT] Session check:', {
      hasSession: !!session,
      userId: session?.user?.id,
      error: sessionError?.message
    })

    if (sessionError) {
      console.error('[CHAT] Session error:', sessionError)
    }

    if (!session) {
      console.warn('[CHAT] No session found, redirecting to login')
      router.push('/login')
      return
    }

    console.log('[CHAT] User authenticated:', session.user.email)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (!profile?.selected_provider) {
      // No provider selected, redirect to onboarding
      router.push('/onboarding/provider')
      return
    }

    setUserProfile(profile)

    // Check if user has API keys configured
    let hasPremium = false
    if (profile.enterprise_mode) {
      const { data: credentials } = await supabase
        .from('user_provider_credentials')
        .select('provider')
        .eq('user_id', session.user.id)
        .not('api_key', 'is', null)

      hasPremium = Boolean(credentials && credentials.length > 0)
    }
    setUsingPremium(hasPremium)

    // Add welcome message
    const providerText = hasPremium
      ? `premium ${providerNames[profile.selected_provider as keyof typeof providerNames] || 'AI'} with your API key`
      : 'free AI models with smart caching'

    setMessages([{
      role: 'assistant',
      content: `Welcome! I'm powered by ${providerText}. How can I help you today?`
    }])
  }

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return

    const userMessage = message.trim()
    console.log('[CHAT] Sending message:', userMessage.substring(0, 50) + '...')
    setMessage('')

    // Add user message with metadata
    const newUserMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    }

    setMessages(prev => {
      const updated = [...prev, newUserMessage]
      // Keep only last MAX_MESSAGES_IN_MEMORY messages to prevent memory leaks
      if (updated.length > MAX_MESSAGES_IN_MEMORY) {
        setHasOlderMessages(true)
        return updated.slice(-MAX_MESSAGES_IN_MEMORY)
      }
      return updated
    })
    setIsLoading(true)

    // Blur the input to dismiss mobile keyboard
    if (inputRef.current) {
      inputRef.current.blur()
    }

    try {
      // Send message to our API with selected provider and model
      console.log('[CHAT] Calling unified-chat API with provider:', selectedProvider)
      const response = await fetch('/api/v2/unified-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, newUserMessage],
          preferredProvider: selectedProvider === 'auto' ? undefined : selectedProvider
        })
      })

      console.log('[CHAT] Unified-chat response:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[CHAT] API error:', response.status, errorData)
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      console.log('[CHAT] Response received:', {
        hasResponse: !!data.response,
        provider: data.provider,
        cached: data.metadata?.cached,
        responseLength: data.response?.length
      })

      // Add assistant message with metadata
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response,
        provider: data.provider,
        model: data.model,
        created_at: new Date().toISOString()
      }

      setMessages(prev => {
        const updated = [...prev, assistantMessage]
        // Keep only last MAX_MESSAGES_IN_MEMORY messages to prevent memory leaks
        if (updated.length > MAX_MESSAGES_IN_MEMORY) {
          setHasOlderMessages(true)
          return updated.slice(-MAX_MESSAGES_IN_MEMORY)
        }
        return updated
      })

      // Refresh conversations list to include new conversation
      loadConversations()

    } catch (error: any) {
      // Provide specific error messages based on error type
      let errorMessage = 'Sorry, I encountered an error. Please try again.'

      if (error.status === 401) {
        errorMessage = '🔒 Session expired. Please refresh the page to log in again.'
      } else if (error.status === 429) {
        errorMessage = '⏱️ Rate limit reached. Please wait a few seconds and try again.'
      } else if (error.status === 503) {
        errorMessage = '🔧 AI service temporarily unavailable. Trying backup provider...'
      } else if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
        errorMessage = '📡 Network error. Please check your connection and try again.'
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        created_at: new Date().toISOString(),
        error: true,
        retryMessage: message
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider)
  }

  const handleRetry = (retryMessage: string) => {
    // Remove the error message from display
    setMessages(prev => prev.filter(msg => !msg.error))
    // Set the message and trigger send
    setMessage(retryMessage)
    // Trigger send after state updates
    setTimeout(() => {
      handleSendMessage()
    }, 0)
  }

  const startNewConversation = () => {
    setMessages([])
    setCurrentConversationId(null)
    setShowHistory(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSettings = () => {
    router.push('/settings')
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    )
  }

  const ProviderIcon = providerIcons[userProfile.selected_provider as keyof typeof providerIcons] || Bot

  return (
    <div
      className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-slate-900 dark:to-gray-900 flex flex-col overflow-hidden"
      style={{
        height: '100dvh', // Dynamic viewport height for mobile browsers
        minHeight: '-webkit-fill-available' // Safari fallback
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4 shadow-sm relative z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <ProviderIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">CacheGPT</h1>
              <div className="flex items-center gap-2">
                <ProviderSelector
                  currentProvider={selectedProvider}
                  onProviderChange={handleProviderChange}
                  className="hidden sm:block"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startNewConversation}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors hidden sm:block"
              title="New Chat"
              aria-label="Start new chat"
            >
              New Chat
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors relative"
              title="Chat History"
              aria-label={showHistory ? "Close chat history" : "Open chat history"}
              aria-expanded={showHistory}
            >
              <History className="w-5 h-5" />
              {conversations.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full text-xs text-white flex items-center justify-center">
                  {conversations.length > 9 ? '9+' : conversations.length}
                </span>
              )}
            </button>
            <div className="sm:hidden">
              <ProviderSelector
                currentProvider={selectedProvider}
                onProviderChange={handleProviderChange}
              />
            </div>
            <button
              onClick={handleSettings}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Chat History Sidebar */}
      {showHistory && (
        <div className="fixed top-[85px] bottom-0 right-0 w-80 max-w-[90vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-20 overflow-y-auto shadow-xl">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chat History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {conversations.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
                No conversations yet. Start chatting to see your history here.
              </p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.conversation_id}
                  onClick={() => loadConversationMessages(conv.conversation_id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    currentConversationId === conv.conversation_id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {conv.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {conv.message_count} messages • {providerNames[conv.provider as keyof typeof providerNames]}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {getRelativeTime(conv.last_message_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        className={`flex-1 overflow-y-auto p-4 pb-safe transition-all duration-300 ${showHistory ? 'sm:mr-80 mr-0' : ''}`}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        <div className="max-w-4xl mx-auto space-y-4 pb-4">
          {/* Load Older Messages Button */}
          {hasOlderMessages && (
            <div className="flex justify-center mb-4">
              <button
                onClick={loadOlderMessages}
                disabled={loadingOlderMessages}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition disabled:opacity-50"
                aria-label="Load older messages"
              >
                {loadingOlderMessages ? (
                  <>
                    <Loader2 className="inline w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  '↑ Load Older Messages'
                )}
              </button>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-lg p-4 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white ml-auto'
                  : msg.error
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.error && msg.retryMessage && (
                  <button
                    onClick={() => handleRetry(msg.retryMessage!)}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-100"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-200"></div>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Fixed at bottom with safe area and mobile protection */}
      <div className="flex-shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 shadow-sm"
           style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2 mb-2 sm:mb-0">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[44px] max-h-[200px] overflow-y-auto"
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              aria-label="Type your message"
              role="textbox"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={!message.trim() || isLoading}
              className="px-3 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2 text-sm sm:text-base shadow-sm"
              aria-label="Send message"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bug Report Button */}
      <BugReportButton />
    </div>
  )
}