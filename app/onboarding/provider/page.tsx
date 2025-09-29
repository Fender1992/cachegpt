'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Bot, Brain, Sparkles, Zap, CheckCircle2 } from 'lucide-react'
import { getMostAdvancedModel } from '@/lib/llm-config'

const providers = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    description: 'OpenAI GPT-5',
    icon: Bot,
    color: 'green'
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Opus 4.1',
    icon: Brain,
    color: 'purple'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini 2.0 Ultra',
    icon: Sparkles,
    color: 'blue'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Perplexity Pro with Real-time Search',
    icon: Zap,
    color: 'orange'
  }
]

export default function ProviderSelectionPage() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    checkExistingProvider()
  }, [])

  const checkExistingProvider = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Check if user already has a provider selected
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('selected_provider')
      .eq('id', session.user.id)
      .single()

    if (profile?.selected_provider) {
      // User already has provider, redirect to chat
      router.push('/chat')
    }
  }

  const handleProviderSelect = async (providerId: string) => {
    setSelectedProvider(providerId)
    setError(null)
  }

  const handleContinue = async () => {
    if (!selectedProvider) {
      setError('Please select a provider to continue')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Debug: Check localStorage for session
      if (typeof window !== 'undefined') {
        const localStorageKeys = Object.keys(localStorage)
        console.log('[DEBUG] localStorage keys:', localStorageKeys)

        // Look for Supabase session keys
        const supabaseKeys = localStorageKeys.filter(key => key.includes('supabase'))
        console.log('[DEBUG] Supabase keys in localStorage:', supabaseKeys)

        supabaseKeys.forEach(key => {
          const value = localStorage.getItem(key)
          if (value && value.includes('access_token')) {
            console.log('[DEBUG] Found session in localStorage key:', key)
            try {
              const parsed = JSON.parse(value)
              console.log('[DEBUG] Session has access_token:', !!parsed.access_token)
            } catch (e) {
              console.log('[DEBUG] Could not parse session from localStorage')
            }
          }
        })
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      console.log('[DEBUG] getSession result:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        accessTokenLength: session?.access_token?.length,
        userId: session?.user?.id,
        email: session?.user?.email,
        error: sessionError
      })

      if (!session) {
        console.error('[ERROR] No session found, redirecting to login')
        router.push('/login')
        return
      }

      if (!session.access_token) {
        console.error('[ERROR] Session exists but no access_token!', session)
      }

      // Get the most advanced model for the selected provider
      const model = await getMostAdvancedModel(selectedProvider)

      // Update user profile with selected provider
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          selected_provider: selectedProvider,
          selected_model: model,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id)

      if (updateError) {
        throw updateError
      }

      // Check if this came from CLI
      const urlParams = new URLSearchParams(window.location.search)
      const source = urlParams.get('source')
      const callbackPort = urlParams.get('callback_port')

      // For Claude, require session setup
      if (selectedProvider === 'claude') {
        const params = new URLSearchParams()
        if (source) params.set('source', source)
        if (callbackPort) params.set('callback_port', callbackPort)
        const queryString = params.toString() ? `?${params.toString()}` : ''
        router.push(`/auth/claude-setup${queryString}`)
        return
      }

      if (source === 'cli' && callbackPort) {
        // CLI user - redirect back to local callback with explicit token parameter names
        const params = new URLSearchParams({
          provider: selectedProvider,
          model: await getMostAdvancedModel(selectedProvider),
          user: JSON.stringify({
            email: session.user.email || '',
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'
          })
        });

        // Use explicit parameter name based on token type
        if (selectedProvider === 'claude') {
          // For Claude, we'll eventually use claude_session when user sets up web session
          // For now, use supabase_jwt for CacheGPT API access
          params.set('supabase_jwt', session.access_token);
        } else {
          // Other providers use Supabase JWT for CacheGPT API access
          params.set('supabase_jwt', session.access_token);
        }

        const callbackUrl = `http://localhost:${callbackPort}/auth/callback?${params.toString()}`

        console.log('[DEBUG] Redirecting to CLI with token:', session.access_token ? 'Present' : 'Missing')
        window.location.href = callbackUrl
      } else {
        // Web user - redirect to chat
        router.push('/chat')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save provider selection')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-green-500" />
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-white">Welcome to CacheGPT!</h1>
            <p className="text-sm sm:text-base text-gray-300">Choose your AI model provider to get started</p>
            <p className="text-xs sm:text-sm text-gray-400 mt-2">You can change this anytime in Settings</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {providers.map((provider) => {
              const Icon = provider.icon
              const isSelected = selectedProvider === provider.id
              return (
                <button
                  key={provider.id}
                  onClick={() => handleProviderSelect(provider.id)}
                  className={`p-4 sm:p-6 rounded-xl transition-all transform hover:scale-105 border-2 ${
                    isSelected
                      ? `border-${provider.color}-500 bg-${provider.color}-500/10`
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                  disabled={isLoading}
                >
                  <Icon className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 ${
                    isSelected ? `text-${provider.color}-500` : 'text-gray-400'
                  }`} />
                  <h3 className="font-semibold text-base sm:text-lg text-white">{provider.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-400">{provider.description}</p>
                  {isSelected && (
                    <div className="mt-3">
                      <CheckCircle2 className="w-5 h-5 mx-auto text-green-500" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-center">
            <button
              onClick={handleContinue}
              disabled={!selectedProvider || isLoading}
              className="px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm sm:text-base font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Continue to Chat
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}