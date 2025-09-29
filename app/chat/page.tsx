'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Send, Bot, Brain, Sparkles, Zap, Settings, LogOut } from 'lucide-react'

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

export default function ChatPage() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [usingPremium, setUsingPremium] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

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

      hasPremium = !!(credentials && credentials.length > 0)
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
    if (!message.trim() || isLoading || !userProfile) return

    const userMessage = message.trim()
    setMessage('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      // Send message to our API which will use server-side credentials
      const response = await fetch('/api/v2/unified-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          provider: userProfile.selected_provider,
          model: userProfile.selected_model,
          messages: [...messages, { role: 'user', content: userMessage }]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }])
    } finally {
      setIsLoading(false)
    }
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex flex-col">
      {/* Header */}
      <div className="glass-card border-b border-white/10 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ProviderIcon className="w-8 h-8 text-purple-400" />
            <div>
              <h1 className="text-xl font-bold text-white">CacheGPT Chat</h1>
              <p className="text-sm text-gray-400">
                Using {providerNames[userProfile.selected_provider as keyof typeof providerNames]}
                {usingPremium && (
                  <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs rounded-full">
                    Premium
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSettings}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-lg p-4 ${
                msg.role === 'user'
                  ? 'bg-purple-600/20 border border-purple-500/30 text-white'
                  : 'glass-card text-gray-100'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="glass-card rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-100"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-200"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="glass-card border-t border-white/10 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!message.trim() || isLoading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}