'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Send, Bot, Brain, Sparkles, Zap, Settings, LogOut, History, RefreshCw, Loader2, Home, Trash2, ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react'
import BugReportButton from '@/components/bug-report-button'
import ProviderSelector from '@/components/provider-selector'
import Toast from '@/components/toast'
import ExamplePrompts from '@/components/chat/ExamplePrompts'
import CacheToast from '@/components/chat/CacheToast'
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
  cached?: boolean
  cacheId?: string
  feedbackGiven?: 'helpful' | 'outdated' | 'incorrect'
}

// Maximum messages to keep in memory (prevents memory leaks in long sessions)
const MAX_MESSAGES_IN_MEMORY = 50

function ChatPageContent() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [conversations, setConversations] = useState<any[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null) // Track active conversation for current chat session
  const [showHistory, setShowHistory] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('auto')
  const [isLoading, setIsLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [usingPremium, setUsingPremium] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showCacheToast, setShowCacheToast] = useState(false)
  const [lastCacheSaved, setLastCacheSaved] = useState(0)
  const [currentMode, setCurrentMode] = useState<any>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
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
    loadUserProfile()
    loadUserPreferences()
    loadConversations()
    loadModeFromQueryParam()
  }, [])

  const loadModeFromQueryParam = async () => {
    const modeSlug = searchParams.get('mode')
    if (!modeSlug) return

    try {
      const response = await fetch('/api/modes')
      if (response.ok) {
        const data = await response.json()
        const mode = data.modes?.find((m: any) => m.slug === modeSlug)
        if (mode) {
          setCurrentMode(mode)
        }
      } else {
        console.warn('[CHAT] Modes API unavailable, skipping mode loading')
      }
    } catch (error) {
      console.error('[CHAT] Error loading mode (non-blocking):', error)
      // Don't block chat if modes API fails
    }
  }

  const handleExamplePromptClick = (promptText: string) => {
    setMessage(promptText)
    // Auto-focus input
    inputRef.current?.focus()
  }

  const loadUserPreferences = async () => {
    // No longer loading model preferences - system auto-selects best models
    // Provider selection handled by ProviderSelector component
  }

  const loadConversations = async () => {
    try {
      // Get user ID from current session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        console.warn('[CHAT] No session found, skipping conversations load')
        return
      }

      const userId = session.user.id

      const response = await fetch(`/api/conversations?limit=20&platform=web&user_id=${userId}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
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
        setActiveConversationId(conversationId) // Set as active so new messages append to this conversation
        setShowHistory(false)
      }
    } catch (error) {
      logError('Error loading conversation messages', error)
    }
  }

  const deleteConversation = async (conversationId: string, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent loading the conversation when clicking delete
    setDeleteConfirmId(conversationId) // Show confirmation modal
  }

  const confirmDelete = async () => {
    if (!deleteConfirmId) return

    const conversationId = deleteConfirmId
    setDeleteConfirmId(null) // Close modal

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {}

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`/api/conversations?id=${conversationId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      })

      if (response.ok) {
        // If the deleted conversation was active, clear it
        if (currentConversationId === conversationId) {
          setMessages([])
          setCurrentConversationId(null)
          setActiveConversationId(null)
        }

        // Refresh conversations list
        loadConversations()

        // Show success toast
        setToast({ message: 'Conversation deleted successfully', type: 'success' })
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('[CHAT] Failed to delete conversation:', errorData)
        setToast({ message: 'Failed to delete conversation', type: 'error' })
      }
    } catch (error) {
      console.error('[CHAT] Error deleting conversation:', error)
      logError('Error deleting conversation', error)
      setToast({ message: 'An error occurred while deleting the conversation', type: 'error' })
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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[CHAT] Session error:', sessionError)
    }

    // Allow anonymous chatting - no redirect if no session
    if (!session) {
      console.log('[CHAT] No session found - anonymous mode')
      // Set a minimal profile for anonymous users so the page loads
      setUserProfile({ selected_provider: 'auto', enterprise_mode: false })
      return
    }

    let { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    // Auto-set default provider if not selected (new users)
    if (!profile?.selected_provider) {

      // Update profile with default provider
      const { data: updatedProfile } = await supabase
        .from('user_profiles')
        .update({ selected_provider: 'auto' })
        .eq('id', session.user.id)
        .select()
        .single()

      profile = updatedProfile || profile
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

  const handleFeedback = async (messageIndex: number, feedback: 'helpful' | 'outdated' | 'incorrect') => {
    const msg = messages[messageIndex]
    if (!msg.cacheId || msg.feedbackGiven) return

    try {
      const response = await fetch('/api/cache-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cacheId: msg.cacheId,
          feedback
        })
      })

      if (response.ok) {
        // Update message to show feedback was given
        setMessages(prev => prev.map((m, i) =>
          i === messageIndex ? { ...m, feedbackGiven: feedback } : m
        ))

        // Show toast notification
        const feedbackMessages = {
          helpful: '👍 Thanks! This helps improve cache quality.',
          outdated: '⚠️ Noted! This answer will be refreshed.',
          incorrect: '❌ Thanks for reporting. This will be reviewed.'
        }
        setToastMessage(feedbackMessages[feedback])
        setShowToast(true)
      }
    } catch (error) {
      console.error('[FEEDBACK] Error submitting feedback:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return

    const userMessage = message.trim()
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
      // Get session for authentication
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      // Add Bearer token if we have a session
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      // Prepare request body with optional mode system_prompt
      const requestBody: any = {
        messages: [...messages, newUserMessage],
        preferredProvider: selectedProvider === 'auto' ? undefined : selectedProvider,
        conversationId: activeConversationId // Send current conversation ID if exists
      }

      // Add mode's system_prompt if a mode is active
      if (currentMode?.system_prompt) {
        requestBody.systemPrompt = currentMode.system_prompt
      }

      // Send message to our API with selected provider and model
      const response = await fetch('/api/v2/unified-chat', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[CHAT] API error:', response.status, errorData)
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      // Save conversation ID for next message in this session
      if (data.conversationId) {
        setActiveConversationId(data.conversationId)
      }

      // Check for cache hit and show toast
      if (data.cached || data.cache_hit) {
        const savedCents = data.cost_saved || 2 // Default 2 cents if not provided
        setLastCacheSaved(savedCents)
        setShowCacheToast(true)
      }

      // Add assistant message with metadata
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response,
        provider: data.provider,
        model: data.model,
        created_at: new Date().toISOString(),
        cached: data.cached || false,
        cacheId: data.cacheId || undefined
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

      // Refresh conversations list to include new/updated conversation
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
    setActiveConversationId(null) // Clear active conversation to start fresh
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
              onClick={() => router.push('/')}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Home"
              aria-label="Go to home page"
            >
              <Home className="w-5 h-5" />
            </button>
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
        <div className="fixed top-[85px] right-0 w-80 max-w-[90vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-20 overflow-y-auto shadow-xl" style={{ height: 'calc(100vh - 85px - 80px)' }}>
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
                <div
                  key={conv.conversation_id}
                  className={`relative w-full p-3 rounded-lg border transition-colors group ${
                    currentConversationId === conv.conversation_id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <button
                    onClick={() => loadConversationMessages(conv.conversation_id)}
                    className="w-full text-left pr-8"
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
                  <button
                    onClick={(e) => deleteConversation(conv.conversation_id, e)}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
          {/* Mode Banner */}
          {currentMode && (
            <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border-2 border-purple-200 dark:border-purple-700">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{currentMode.icon}</span>
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">
                    Mode: {currentMode.title}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {currentMode.description}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Example Prompts - Show when no messages */}
          {messages.length === 0 && !isLoading && (
            <ExamplePrompts
              onPromptClick={handleExamplePromptClick}
              layout="grid"
            />
          )}

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

                {/* Feedback buttons for cached assistant messages */}
                {msg.role === 'assistant' && msg.cached && msg.cacheId && !msg.error && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    {msg.feedbackGiven ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        {msg.feedbackGiven === 'helpful' && <ThumbsUp className="w-4 h-4" />}
                        {msg.feedbackGiven === 'outdated' && <AlertTriangle className="w-4 h-4" />}
                        {msg.feedbackGiven === 'incorrect' && <ThumbsDown className="w-4 h-4" />}
                        <span>Feedback submitted</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Was this helpful?</span>
                        <button
                          onClick={() => handleFeedback(idx, 'helpful')}
                          className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                          title="Helpful answer"
                          aria-label="Mark as helpful"
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleFeedback(idx, 'outdated')}
                          className="p-1.5 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded text-gray-600 dark:text-gray-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                          title="Outdated information"
                          aria-label="Mark as outdated"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleFeedback(idx, 'incorrect')}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Incorrect answer"
                          aria-label="Mark as incorrect"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
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
      <div className="flex-shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 shadow-sm sticky bottom-0 z-10"
           style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
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
              onFocus={(e) => {
                // On mobile, prevent scrolling when focusing
                if (window.innerWidth < 640) {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 300);
                }
              }}
              placeholder="Type your message..."
              className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[44px] max-h-[120px] overflow-y-auto touch-manipulation"
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              aria-label="Type your message"
              role="textbox"
              rows={1}
              style={{ fontSize: '16px' }}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Conversation
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this conversation? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={3000}
        />
      )}

      {/* Cache Hit Toast */}
      {showCacheToast && (
        <CacheToast
          savedCents={lastCacheSaved}
          onClose={() => setShowCacheToast(false)}
          duration={4000}
        />
      )}
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}