'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Send, Bot, Brain, Sparkles, Zap, Settings, LogOut, LogIn, History, RefreshCw, Loader2, Home, Trash2, ThumbsUp, ThumbsDown, AlertTriangle, Rocket, Gauge } from 'lucide-react'
import BugReportButton from '@/components/bug-report-button'
import ProviderSelector from '@/components/provider-selector'
import Toast from '@/components/toast'
import ExamplePrompts from '@/components/chat/ExamplePrompts'
import CacheToast from '@/components/chat/CacheToast'
import ShareButton from '@/components/chat/ShareButton'
import ConversationReferenceButton from '@/components/chat/ConversationReferenceButton'
import MarkdownMessage from '@/components/chat/MarkdownMessage'
import MobileChatModal from '@/components/chat/MobileChatModal'
import FileUpload, { UploadedFile } from '@/components/chat/FileUpload'
import { error as logError } from '@/lib/logger'
import { isFeatureEnabled } from '@/lib/featureFlags'

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

function ChatPageContent({ params }: { params?: Promise<{ id: string }> }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [conversations, setConversations] = useState<any[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null) // Track active conversation for current chat session
  const [showHistory, setShowHistory] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('auto')
  const [qualityMode, setQualityMode] = useState<'fast' | 'best'>('fast') // Quality mode toggle
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [usingPremium, setUsingPremium] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showCacheToast, setShowCacheToast] = useState(false)
  const [lastCacheSaved, setLastCacheSaved] = useState(0)
  const [currentMode, setCurrentMode] = useState<any>(null)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [referencedConversationIds, setReferencedConversationIds] = useState<string[]>([])
  const [mobileModalOpen, setMobileModalOpen] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load conversation ID from URL params (if provided)
  useEffect(() => {
    if (params) {
      params.then(resolvedParams => {
        const { id } = resolvedParams
        console.log('[CHAT] URL conversation ID:', id)
        setConversationId(id)
        setCurrentConversationId(id)
        setActiveConversationId(id)
      })
    } else {
      console.log('[CHAT] Base route - no conversation ID')
    }
  }, [params])

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()

    // Get user's timezone for accurate date comparison
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Calculate time difference
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

    // Use user's timezone for date formatting
    return date.toLocaleDateString('en-US', {
      timeZone: userTimezone,
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  useEffect(() => {
    loadUserProfile()
    loadUserPreferences()
    loadConversations()
    loadModeFromQueryParam()
    loadFeatureFlags()
  }, [])

  // Auto-load conversation messages when conversation ID from URL is available
  useEffect(() => {
    if (conversationId && userProfile) {
      console.log('[CHAT] Auto-loading conversation from URL:', conversationId)
      loadConversationMessages(conversationId)
    }
  }, [conversationId, userProfile])

  const loadFeatureFlags = async () => {
    try {
      const response = await fetch('/api/feature-flags')
      if (response.ok) {
        const data = await response.json()
        setShareEnabled(data.flags.share_answer_enabled === true)
      }
    } catch (error) {
      console.error('[FEATURE-FLAGS] Error loading:', error)
    }
  }

  const loadModeFromQueryParam = async () => {
    const modeSlug = searchParams.get('mode')
    const prefillText = searchParams.get('prefill')

    // Load prefill text if present
    if (prefillText) {
      setMessage(decodeURIComponent(prefillText))
    }

    // Load mode if present
    if (!modeSlug) return

    try {
      const response = await fetch('/api/modes')
      if (response.ok) {
        const data = await response.json()
        const mode = data.modes?.find((m: any) => m.slug === modeSlug)
        if (mode) {
          setCurrentMode(mode)

          // Record click for trending
          try {
            await fetch('/api/modes/click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modeSlug, source: 'share' }),
            })
          } catch (err) {
            console.error('[CHAT] Error recording mode click:', err)
          }
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
      console.log('[CHAT] loadConversations: Starting...')

      // Get user ID from current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      console.log('[CHAT] loadConversations: Session check', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        error: sessionError?.message
      })

      if (!session?.user?.id) {
        console.log('[CHAT] No session found, skipping conversations load')
        setConversations([])
        return
      }

      console.log('[CHAT] loadConversations: Making API call for user:', session.user.id)

      // Fetch conversations - send Bearer token since cookies aren't working in App Router
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }

      // Add Authorization header with session token
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
        console.log('[CHAT] loadConversations: Sending Bearer token')
      } else {
        console.warn('[CHAT] loadConversations: No access token in session!')
      }

      const response = await fetch(`/api/conversations?limit=20&platform=web`, {
        headers,
        credentials: 'include' // Keep this in case cookies work in the future
      })

      console.log('[CHAT] loadConversations: API response status:', response.status)

      if (response.ok) {
        const data = await response.json()

        console.log('[CHAT] loadConversations: API response data:', {
          conversationsCount: data.conversations?.length || 0,
          requiresAuth: data.requiresAuth,
          userIdInResponse: data.user_id,
          fullResponse: data
        })

        // Check if user needs to authenticate for conversation history
        if (data.requiresAuth) {
          console.log('[CHAT] Conversation history requires authentication')
          setConversations([])
          // Don't show toast on page load - only when user clicks History button
        } else {
          console.log('[CHAT] Setting conversations:', data.conversations?.length || 0, 'items')
          setConversations(data.conversations || [])
        }
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
      console.log('[CHAT] Loading conversation messages:', conversationId)

      // Get session for authentication
      const { data: { session } } = await supabase.auth.getSession()

      // Detect user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const timezoneOffset = new Date().getTimezoneOffset()

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'x-user-timezone': userTimezone,
        'x-timezone-offset': timezoneOffset.toString()
      }

      // Add Bearer token if we have a session
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
        console.log('[CHAT] Sending Bearer token for conversation messages')
      }

      const response = await fetch(`/api/conversations/${conversationId}/messages?limit=${limit}`, {
        headers,
        credentials: 'include'
      })

      console.log('[CHAT] Conversation messages response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        const loadedMessages = data.messages || []
        console.log('[CHAT] Loaded messages:', loadedMessages.length)
        setMessages(loadedMessages)
        setHasOlderMessages(data.hasMore || false)
        setCurrentConversationId(conversationId)
        setActiveConversationId(conversationId) // Set as active so new messages append to this conversation
        setShowHistory(false)

        // Navigate to the conversation URL to enable refresh persistence
        router.push(`/chat/${conversationId}`)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('[CHAT] Failed to load conversation messages:', response.status, errorData)
      }
    } catch (error) {
      console.error('[CHAT] Exception loading conversation messages:', error)
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
      // Detect user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const timezoneOffset = new Date().getTimezoneOffset()

      // Get session for Bearer token
      const { data: { session } } = await supabase.auth.getSession()

      const headers: HeadersInit = {
        'x-user-timezone': userTimezone,
        'x-timezone-offset': timezoneOffset.toString()
      }

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const oldestMessage = messages[0]
      const response = await fetch(
        `/api/conversations/${currentConversationId}/messages?before=${oldestMessage?.created_at}&limit=20`,
        {
          headers,
          credentials: 'include'
        }
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
      // Set a minimal profile for anonymous users so the page loads
      setUserProfile({ selected_provider: 'auto', enterprise_mode: false })
      setIsAnonymous(true)
      // Add a welcome message for anonymous users
      setMessages([{
        role: 'assistant',
        content: '👋 Welcome! You can start chatting right away - no sign-up required.\n\n**Note:** Your conversations won\'t be saved. Sign in to keep your chat history and unlock more features!',
        provider: 'system'
      }])
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

    // Add welcome message only if no messages exist (new chat)
    // Don't overwrite messages when loading conversation history
    const providerText = hasPremium
      ? `premium ${providerNames[profile.selected_provider as keyof typeof providerNames] || 'AI'} with your API key`
      : 'free AI models with smart caching'

    // Only set welcome message if messages array is empty (fresh page load with no conversation)
    setMessages(prev => {
      if (prev.length === 0) {
        return [{
          role: 'assistant',
          content: `Welcome! I'm powered by ${providerText}. How can I help you today?`
        }]
      }
      return prev
    })
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
        setToast({ message: feedbackMessages[feedback], type: 'success' })
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

      // Detect user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const timezoneOffset = new Date().getTimezoneOffset()

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'x-user-timezone': userTimezone,
        'x-timezone-offset': timezoneOffset.toString()
      }

      // Add Bearer token if we have a session
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      // Prepare request body with optional mode parameters
      const requestBody: any = {
        messages: [...messages, newUserMessage],
        preferredProvider: selectedProvider === 'auto' ? undefined : selectedProvider,
        conversationId: activeConversationId, // Send current conversation ID if exists
        referencedConversations: referencedConversationIds.length > 0 ? referencedConversationIds : undefined,
        qualityMode, // Include quality mode in request
        uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : undefined // Include uploaded files
      }

      // Add mode's optimization parameters if a mode is active
      if (currentMode?.system_prompt) {
        requestBody.systemPrompt = currentMode.system_prompt
      }
      if (currentMode?.temperature !== undefined) {
        requestBody.temperature = currentMode.temperature
      }
      if (currentMode?.max_tokens) {
        requestBody.maxTokens = currentMode.max_tokens
      }
      if (currentMode?.preferred_model) {
        // Override user's provider selection with mode's preferred model
        requestBody.preferredProvider = currentMode.preferred_model
      }

      // Use streaming endpoint for better UX
      const response = await fetch('/api/v2/unified-chat-stream', {
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

      // Handle streaming response
      setIsStreaming(true)
      setStreamingMessage('')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''
      let finalData: any = {}

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        // Decode the chunk
        buffer += decoder.decode(value, { stream: true })

        // Process complete messages (lines ending with \n\n)
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))

              if (data.error) {
                throw new Error(data.error)
              }

              // Update streaming message
              setStreamingMessage(data.content || '')

              // If this is the final message, save the metadata
              if (data.done) {
                finalData = data
              }
            } catch (e) {
              console.error('[STREAM] Parse error:', e)
            }
          }
        }
      }

      // Stop streaming
      setIsStreaming(false)

      // Save conversation ID and update URL if this is a new conversation
      if (finalData.conversationId) {
        setActiveConversationId(finalData.conversationId)

        // If we don't have a conversation ID in URL yet, navigate to the conversation URL
        if (!conversationId && finalData.conversationId) {
          console.log('[CHAT] Navigating to conversation URL:', finalData.conversationId)
          router.push(`/chat/${finalData.conversationId}`)
        }
      }

      // Check for cache hit and show toast
      if (finalData.cached) {
        const savedCents = finalData.cost_saved || 2
        setLastCacheSaved(savedCents)
        setShowCacheToast(true)
      }

      // Add assistant message with final content and metadata
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: finalData.content || streamingMessage,
        provider: finalData.provider,
        model: finalData.model,
        created_at: new Date().toISOString(),
        cached: finalData.cached || false,
        cacheId: finalData.cacheId || undefined
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

      // Clear streaming message and uploaded files
      setStreamingMessage('')
      setUploadedFiles([]) // Clear files after sending

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
    setReferencedConversationIds([]) // Clear referenced conversations
    setShowHistory(false)
    // Navigate to base /chat URL for new conversation
    router.push('/chat')
  }

  const handleConversationReference = (conversationId: string, title: string) => {
    // Don't allow referencing the current conversation
    if (conversationId === activeConversationId) {
      setToast({ message: 'Cannot reference the current conversation', type: 'warning' })
      return
    }

    // Don't allow duplicate references
    if (referencedConversationIds.includes(conversationId)) {
      setToast({ message: 'This conversation is already referenced', type: 'warning' })
      return
    }

    // Add to referenced conversations
    setReferencedConversationIds(prev => [...prev, conversationId])
    setToast({ message: `Referenced: ${title}`, type: 'success' })
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
        height: '100dvh',
        minHeight: '-webkit-fill-available'
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
            {/* Quality Mode Toggle */}
            <button
              onClick={() => setQualityMode(qualityMode === 'fast' ? 'best' : 'fast')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
                qualityMode === 'best'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={qualityMode === 'fast' ? 'Fast Mode (Click for Best Quality)' : 'Best Mode - Using Self-MoA'}
              aria-label={`Quality mode: ${qualityMode}`}
            >
              {qualityMode === 'fast' ? (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Fast</span>
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Best</span>
                </>
              )}
            </button>
            <button
              onClick={startNewConversation}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors hidden sm:block"
              title="New Chat"
              aria-label="Start new chat"
            >
              New Chat
            </button>
            <button
              onClick={async () => {
                // Check if user is authenticated before showing history
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.user?.id) {
                  setToast({
                    message: 'Login or signup to access conversation history',
                    type: 'info'
                  })
                  // Redirect to login after short delay so user sees the toast
                  setTimeout(() => router.push('/login'), 1500)
                } else {
                  setShowHistory(!showHistory)
                }
              }}
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
            {!isAnonymous && (
              <button
                onClick={handleSettings}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title="Settings"
                aria-label="Open settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            {isAnonymous ? (
              <button
                onClick={() => router.push('/login')}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                title="Sign In"
                aria-label="Sign in to save your chats"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
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
            {isAnonymous ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                  Sign in to save your chat history
                </p>
                <button
                  onClick={() => router.push('/login')}
                  className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors mx-auto"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              </div>
            ) : conversations.length === 0 ? (
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
        className={`flex-1 overflow-y-auto p-4 pb-safe transition-all duration-300 bg-gray-50 dark:bg-gray-900/50 ${showHistory ? 'sm:mr-80 mr-0' : ''}`}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        <div className="max-w-4xl mx-auto space-y-5 pb-4">
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
              mode={currentMode}
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
              <div className={`max-w-[85%] rounded-lg shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white ml-auto px-5 py-3.5'
                  : msg.error
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 px-5 py-3.5'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 px-6 py-4'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                ) : (
                  <MarkdownMessage content={msg.content} />
                )}
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

                {/* Share button for assistant messages (feature flag) */}
                {msg.role === 'assistant' && !msg.error && shareEnabled && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <ShareButton
                      prompt={messages[idx - 1]?.content || ''}
                      content={msg.content}
                      isGuest={!userProfile}
                      onShare={(url) => {
                        setToast({ message: 'Link copied to clipboard!', type: 'success' })
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Streaming message */}
          {isStreaming && streamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 px-6 py-4">
                <MarkdownMessage content={streamingMessage} isStreaming={true} />
              </div>
            </div>
          )}
          {/* Loading indicator (before streaming starts) */}
          {isLoading && !isStreaming && (
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
          {/* Referenced conversations indicator */}
          {referencedConversationIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {referencedConversationIds.map((refId) => {
                const refConv = conversations.find(c => c.id === refId)
                return refConv ? (
                  <div key={refId} className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-full">
                    <span className="truncate max-w-[200px]">{refConv.title}</span>
                    <button
                      onClick={() => setReferencedConversationIds(prev => prev.filter(id => id !== refId))}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                      aria-label="Remove reference"
                    >
                      ×
                    </button>
                  </div>
                ) : null
              })}
            </div>
          )}
          <div className="flex gap-2">
            <FileUpload
              onFilesChange={setUploadedFiles}
              maxFiles={5}
              disabled={isLoading}
            />
            <ConversationReferenceButton
              conversations={conversations.filter(c => c.id !== activeConversationId)}
              onReferenceSelect={handleConversationReference}
              disabled={isLoading}
            />
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

      {/* Floating Chat Button - Mobile only */}
      <button
        onClick={() => setMobileModalOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-50 w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all"
        aria-label="Open chat"
      >
        <Send className="w-6 h-6" />
      </button>

      {/* Mobile Chat Modal - Only messages and input */}
      <MobileChatModal
        isOpen={mobileModalOpen}
        onClose={() => setMobileModalOpen(false)}
      >
        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          <div className="space-y-5">
            {/* Example Prompts - Show when no messages */}
            {messages.length === 0 && !isLoading && (
              <ExamplePrompts
                onPromptClick={handleExamplePromptClick}
                layout="grid"
                mode={currentMode}
              />
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-lg shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white ml-auto px-5 py-3.5'
                    : msg.error
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 px-5 py-3.5'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 px-6 py-4'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                  ) : (
                    <MarkdownMessage content={msg.content} />
                  )}
                </div>
              </div>
            ))}

            {/* Streaming message */}
            {isStreaming && streamingMessage && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 px-6 py-4">
                  <MarkdownMessage content={streamingMessage} isStreaming={true} />
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && !isStreaming && (
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
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-3">
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
              placeholder="Type your message..."
              className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[44px] max-h-[120px] overflow-y-auto"
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
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </MobileChatModal>
    </div>
  )
}

export default function ChatPage({ params }: { params?: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      </div>
    }>
      <ChatPageContent params={params} />
    </Suspense>
  )
}