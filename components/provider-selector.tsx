'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Check, Settings } from 'lucide-react'
import { useProviderCache } from '@/lib/provider-cache-context'

interface ProviderSelectorProps {
  currentProvider?: string
  onProviderChange?: (provider: string) => void
  className?: string
}

export default function ProviderSelector({
  currentProvider = 'auto',
  onProviderChange,
  className = ''
}: ProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(currentProvider)

  // Use cached providers instead of fetching on every mount
  const { providers: availableProviders, loading } = useProviderCache()

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

  // Auto-select 'auto' if user has no API keys
  useEffect(() => {
    if (!loading && availableProviders.length === 1 && availableProviders[0].provider === 'auto') {
      setSelectedProvider('auto')
      onProviderChange?.('auto')
    }
  }, [availableProviders, loading, onProviderChange])

  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider)
    setIsOpen(false)
    onProviderChange?.(provider)
  }

  // If only 'auto' is available (no API keys), show a read-only badge
  if (!loading && availableProviders.length === 1 && availableProviders[0].provider === 'auto') {
    return (
      <div className={`px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg ${className}`}>
        <span className="text-xs font-medium text-purple-700">⚡ Free AI (Auto)</span>
      </div>
    )
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
        aria-label="Select AI provider"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-lg" aria-hidden="true">{providerIcons[selectedProvider]}</span>
        <span className="font-medium text-gray-700">
          {providerDisplayNames[selectedProvider]}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div
            className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
            role="listbox"
            aria-label="Available providers"
          >
            {availableProviders.map((provider) => (
              <button
                key={provider.provider}
                onClick={() => handleProviderSelect(provider.provider)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                role="option"
                aria-selected={selectedProvider === provider.provider}
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