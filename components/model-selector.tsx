'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import { ChevronDown, Check, Crown, Zap, ArrowUpRight } from 'lucide-react'

interface ProviderModel {
  id: string
  provider: string
  model_id: string
  model_name: string
  is_free: boolean
  requires_api_key: boolean
  max_tokens: number
  cost_per_million_input: number
  cost_per_million_output: number
}

interface ModelSelectorProps {
  currentProvider?: string
  currentModel?: string
  onModelChange?: (provider: string, model: string) => void
  platform?: 'web' | 'mobile' | 'cli'
  className?: string
}

export default function ModelSelector({
  currentProvider = 'groq',
  currentModel = 'llama-3.3-70b-versatile',
  onModelChange,
  platform = 'web',
  className = ''
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [availableModels, setAvailableModels] = useState<Record<string, ProviderModel[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState(currentProvider)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [userHasApiKeys, setUserHasApiKeys] = useState(false)

  const providerNames = {
    groq: 'Groq',
    openrouter: 'OpenRouter',
    huggingface: 'HuggingFace',
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    perplexity: 'Perplexity'
  }

  const providerIcons = {
    groq: '⚡',
    openrouter: '🌐',
    huggingface: '🤗',
    chatgpt: '🤖',
    claude: '🧠',
    gemini: '✨',
    perplexity: '🔍'
  }

  useEffect(() => {
    fetchAvailableModels()
  }, [])

  // Refetch when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchAvailableModels()
    }
  }, [isOpen])

  // Redirect to API key setup if no premium providers and user wants to access premium models
  const handleUpgradeRedirect = () => {
    window.location.href = '/dashboard?tab=api-keys&setup=true'
  }

  const fetchAvailableModels = async () => {
    try {
      setLoading(true)

      // Get available models for the current user
      const response = await fetch('/api/provider-models/user-available', {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        setAvailableModels(data.grouped || {})
        setUserHasApiKeys(data.user_access?.has_premium || false)
      } else {
        console.error('Failed to fetch user available models, falling back to backend free providers only')

        // Fallback: fetch all models and filter to backend free providers only
        const fallbackResponse = await fetch('/api/provider-models')
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json()

          // Backend free providers (always available, no API keys needed)
          const freeProviders = new Set(['groq', 'openrouter', 'huggingface'])

          // Filter to only show backend free providers
          const filteredModels = fallbackData.models?.filter((model: any) =>
            freeProviders.has(model.provider)
          ) || []

          // Group the filtered models
          const groupedModels = filteredModels.reduce((acc: any, model: any) => {
            if (!acc[model.provider]) {
              acc[model.provider] = []
            }
            acc[model.provider].push(model)
            return acc
          }, {})

          setAvailableModels(groupedModels)
          setUserHasApiKeys(false) // No API keys in fallback mode
        }
      }
    } catch (error) {
      console.error('Error fetching available models:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleModelSelection = async (provider: string, model: ProviderModel) => {
    setSelectedProvider(provider)
    setSelectedModel(model.model_id)
    setIsOpen(false)

    // Save user preference
    try {
      await fetch('/api/user/model-preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider,
          preferred_model: model.model_id,
          is_premium: model.requires_api_key,
          platform
        })
      })
    } catch (error) {
      console.error('Error saving model preference:', error)
    }

    // Notify parent component
    if (onModelChange) {
      onModelChange(provider, model.model_id)
    }
  }

  const getCurrentModel = () => {
    const providerModels = availableModels[selectedProvider] || []
    return providerModels.find(m => m.model_id === selectedModel)
  }

  const currentModelData = getCurrentModel()

  if (loading) {
    return (
      <div className={`relative ${className}`}>
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
          <div className="w-24 h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Current Selection Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{providerIcons[selectedProvider as keyof typeof providerIcons]}</span>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-900 dark:text-white">
                {currentModelData?.model_name || 'Select Model'}
              </span>
              {currentModelData?.requires_api_key && (
                <Crown className="w-3 h-3 text-yellow-500" />
              )}
              {currentModelData?.is_free && (
                <Zap className="w-3 h-3 text-green-500" />
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {providerNames[selectedProvider as keyof typeof providerNames]}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {!userHasApiKeys ? (
            // Show only upgrade message for users without API keys
            <div className="p-4 text-center">
              <Crown className="w-8 h-8 text-purple-600 dark:text-purple-400 mx-auto mb-3" />
              <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                Unlock Premium Models
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Add your API keys to access Claude, GPT-4, Gemini Pro and more
              </div>
              <button
                onClick={handleUpgradeRedirect}
                className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4" />
                Add API Keys
              </button>
            </div>
          ) : (
            Object.entries(availableModels).map(([provider, models]) => (
            <div key={provider} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
              {/* Provider Header */}
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{providerIcons[provider as keyof typeof providerIcons]}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {providerNames[provider as keyof typeof providerNames]}
                  </span>
                  {models.some(m => m.requires_api_key) && !userHasApiKeys && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400">
                      (Requires API Key)
                    </span>
                  )}
                </div>
              </div>

              {/* Models */}
              {models.map((model) => {
                const isSelected = provider === selectedProvider && model.model_id === selectedModel
                const isDisabled = model.requires_api_key && !userHasApiKeys

                return (
                  <button
                    key={model.model_id}
                    onClick={() => !isDisabled && handleModelSelection(provider, model)}
                    disabled={isDisabled}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {model.model_name}
                          </span>
                          {model.requires_api_key ? (
                            <Crown className="w-3 h-3 text-yellow-500" />
                          ) : (
                            <Zap className="w-3 h-3 text-green-500" />
                          )}
                          {isSelected && <Check className="w-3 h-3 text-blue-600" />}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {model.max_tokens.toLocaleString()} tokens
                          {!model.is_free && (
                            <span className="ml-2">
                              ${model.cost_per_million_input}/${model.cost_per_million_output} per M tokens
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )))}
        </div>
      )}
    </div>
  )
}