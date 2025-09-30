'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import { ChevronDown, Check, Settings } from 'lucide-react'

interface ProviderSelectorProps {
  currentProvider?: string
  onProviderChange?: (provider: string) => void
  className?: string
}

interface UserProvider {
  provider: string
  hasApiKey: boolean
}

export default function ProviderSelector({
  currentProvider = 'auto',
  onProviderChange,
  className = ''
}: ProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [availableProviders, setAvailableProviders] = useState<UserProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState(currentProvider)
  const [loading, setLoading] = useState(true)

  const providerDisplayNames: Record<string, string> = {
    auto: 'Automatic (Free)',
    openai: 'OpenAI',
    anthropic: 'Claude',
    google: 'Gemini',
    perplexity: 'Perplexity'
  }

  const providerIcons: Record<string, string> = {
    auto: '⚡',
    openai: '🤖',
    anthropic: '🧠',
    google: '✨',
    perplexity: '🔍'
  }

  useEffect(() => {
    fetchUserProviders()
  }, [])

  const fetchUserProviders = async () => {
    try {
      setLoading(true)

      // Check which providers the user has API keys for
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        // Not logged in - only show auto
        setAvailableProviders([{ provider: 'auto', hasApiKey: false }])
        setSelectedProvider('auto')
        setLoading(false)
        return
      }

      // Get user's API keys
      const { data: credentials, error } = await supabase
        .from('user_provider_credentials')
        .select('provider_name, status')
        .eq('user_id', session.user.id)
        .eq('status', 'active')

      if (error) {
        console.error('Error fetching credentials:', error)
        setAvailableProviders([{ provider: 'auto', hasApiKey: false }])
        setSelectedProvider('auto')
        setLoading(false)
        return
      }

      // Build list of available providers
      const providers: UserProvider[] = [
        { provider: 'auto', hasApiKey: false }
      ]

      if (credentials && credentials.length > 0) {
        // Map database provider names to our internal names
        const providerMap: Record<string, string> = {
          'claude': 'anthropic',
          'chatgpt': 'openai',
          'gemini': 'google',
          'perplexity': 'perplexity'
        }

        credentials.forEach((cred) => {
          const providerKey = providerMap[cred.provider_name] || cred.provider_name
          if (!providers.find(p => p.provider === providerKey)) {
            providers.push({ provider: providerKey, hasApiKey: true })
          }
        })
      }

      setAvailableProviders(providers)

      // If user has no API keys, force auto
      if (providers.length === 1) {
        setSelectedProvider('auto')
        onProviderChange?.('auto')
      }

      setLoading(false)
    } catch (error) {
      console.error('Error in fetchUserProviders:', error)
      setAvailableProviders([{ provider: 'auto', hasApiKey: false }])
      setSelectedProvider('auto')
      setLoading(false)
    }
  }

  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider)
    setIsOpen(false)
    onProviderChange?.(provider)
  }

  // If only 'auto' is available (no API keys), don't show the selector
  if (!loading && availableProviders.length === 1 && availableProviders[0].provider === 'auto') {
    return null
  }

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-200 h-10 w-48 rounded-lg ${className}`}></div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg">{providerIcons[selectedProvider]}</span>
        <span className="font-medium text-gray-700">
          {providerDisplayNames[selectedProvider]}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
            {availableProviders.map((provider) => (
              <button
                key={provider.provider}
                onClick={() => handleProviderSelect(provider.provider)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-lg">{providerIcons[provider.provider]}</span>
                <span className="flex-1 text-left font-medium text-gray-700">
                  {providerDisplayNames[provider.provider]}
                </span>
                {selectedProvider === provider.provider && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
              </button>
            ))}

            {/* Add API Keys link */}
            <div className="border-t border-gray-200 mt-1 pt-1">
              <a
                href="/settings?tab=api-keys"
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm text-gray-600"
              >
                <Settings className="w-4 h-4" />
                <span>Manage API Keys</span>
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}