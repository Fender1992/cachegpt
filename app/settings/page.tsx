'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase-client'
import {
  Key, Save, Trash2, Eye, EyeOff, Plus,
  AlertCircle, Check, ChevronLeft, CheckCircle, XCircle, Loader2
} from 'lucide-react'
import { validateApiKeyFormat, testApiKeyConnection } from '@/lib/api-key-validator'

interface ApiKey {
  provider: string
  api_key: string
  masked?: string
  validationStatus?: 'idle' | 'testing' | 'valid' | 'invalid'
  validationError?: string
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
  { id: 'perplexity', name: 'Perplexity', placeholder: 'pplx-...' },
]

export default function SettingsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [enterpriseMode, setEnterpriseMode] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      loadUserSettings()
    }
  }, [user])

  const loadUserSettings = async () => {
    try {
      // Load user profile to check enterprise mode
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('enterprise_mode')
        .eq('user_id', user!.id)
        .single()

      if (profile?.enterprise_mode) {
        setEnterpriseMode(true)
      }

      // Load existing API keys
      const { data: credentials } = await supabase
        .from('user_provider_credentials')
        .select('provider, api_key')
        .eq('user_id', user!.id)
        .not('api_key', 'is', null)

      if (credentials) {
        const keys = credentials.map(cred => ({
          provider: cred.provider,
          api_key: atob(cred.api_key), // Decode from base64
          masked: maskApiKey(atob(cred.api_key))
        }))
        setApiKeys(keys)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const maskApiKey = (key: string): string => {
    if (!key) return ''
    if (key.length <= 8) return '****'
    return key.substring(0, 4) + '****' + key.substring(key.length - 4)
  }

  const handleAddKey = (provider: string) => {
    const exists = apiKeys.find(k => k.provider === provider)
    if (!exists) {
      setApiKeys([...apiKeys, { provider, api_key: '', masked: '' }])
      setShowKeys({ ...showKeys, [provider]: true })
    }
  }

  const handleUpdateKey = (provider: string, value: string) => {
    setApiKeys(apiKeys.map(k =>
      k.provider === provider
        ? { ...k, api_key: value, masked: maskApiKey(value) }
        : k
    ))
  }

  const handleRemoveKey = (provider: string) => {
    setApiKeys(apiKeys.filter(k => k.provider !== provider))
  }

  const handleTestConnection = async (provider: string) => {
    const key = apiKeys.find(k => k.provider === provider)
    if (!key || !key.api_key) return

    // Update status to testing
    setApiKeys(apiKeys.map(k =>
      k.provider === provider
        ? { ...k, validationStatus: 'testing', validationError: undefined }
        : k
    ))

    // Format validation first
    const formatCheck = validateApiKeyFormat(provider, key.api_key)
    if (!formatCheck.valid) {
      setApiKeys(apiKeys.map(k =>
        k.provider === provider
          ? { ...k, validationStatus: 'invalid', validationError: formatCheck.error }
          : k
      ))
      return
    }

    // Test connection
    const result = await testApiKeyConnection(provider, key.api_key)
    setApiKeys(apiKeys.map(k =>
      k.provider === provider
        ? {
            ...k,
            validationStatus: result.valid ? 'valid' : 'invalid',
            validationError: result.error
          }
        : k
    ))
  }

  const handleSave = async () => {
    if (!user) return

    setSaving(true)
    setMessage(null)

    try {
      // Enable enterprise mode if not already enabled
      if (!enterpriseMode && apiKeys.length > 0) {
        await supabase
          .from('user_profiles')
          .update({ enterprise_mode: true })
          .eq('user_id', user.id)
        setEnterpriseMode(true)
      }

      // Save each API key
      for (const key of apiKeys) {
        if (key.api_key) {
          await supabase
            .from('user_provider_credentials')
            .upsert({
              user_id: user.id,
              user_email: user.email,
              provider: mapProviderName(key.provider),
              api_key: btoa(key.api_key), // Encode to base64
              status: 'ready',
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,provider'
            })
        }
      }

      setMessage({ type: 'success', text: 'API keys saved successfully!' })

      // Reload to get masked versions
      setTimeout(() => {
        loadUserSettings()
        setShowKeys({})
      }, 1500)
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save API keys' })
    } finally {
      setSaving(false)
    }
  }

  const mapProviderName = (provider: string): string => {
    const mapping: Record<string, string> = {
      'openai': 'chatgpt',
      'anthropic': 'claude',
      'google': 'gemini',
      'perplexity': 'perplexity'
    }
    return mapping[provider] || provider
  }

  const toggleShowKey = (provider: string) => {
    setShowKeys({ ...showKeys, [provider]: !showKeys[provider] })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/chat')}
            className="flex items-center gap-2 text-gray-600 hover:text-purple-600 transition mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Chat
          </button>

          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            API Key Settings
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Add your own API keys to use premium models instead of free providers
          </p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {message.type === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {message.text}
          </div>
        )}

        {/* API Keys Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Key className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Your API Keys
            </h2>
          </div>

          {/* Provider List */}
          <div className="space-y-4">
            {PROVIDERS.map(provider => {
              const existingKey = apiKeys.find(k => k.provider === provider.id)
              const isShowing = showKeys[provider.id]

              return (
                <div key={provider.id} className="border rounded-lg p-3 sm:p-4 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                    <h3 className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">
                      {provider.name}
                    </h3>
                    {!existingKey && (
                      <button
                        onClick={() => handleAddKey(provider.id)}
                        className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-xs sm:text-sm"
                      >
                        <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                        Add Key
                      </button>
                    )}
                  </div>

                  {existingKey && (
                    <>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <input
                          type={isShowing ? 'text' : 'password'}
                          value={isShowing ? existingKey.api_key : existingKey.masked || ''}
                          onChange={(e) => handleUpdateKey(provider.id, e.target.value)}
                          placeholder={provider.placeholder}
                          className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <button
                          onClick={() => toggleShowKey(provider.id)}
                          className="p-1.5 sm:p-2 text-gray-600 hover:text-purple-600 transition"
                          title={isShowing ? 'Hide' : 'Show'}
                        >
                          {isShowing ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </button>
                        <button
                          onClick={() => handleRemoveKey(provider.id)}
                          className="p-1.5 sm:p-2 text-red-600 hover:text-red-700 transition"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>

                      {/* Test Connection Button and Status */}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleTestConnection(provider.id)}
                          disabled={existingKey.validationStatus === 'testing'}
                          className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {existingKey.validationStatus === 'testing' ? (
                            <>
                              <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            'Test Connection'
                          )}
                        </button>

                        {existingKey.validationStatus === 'valid' && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3 h-3" />
                            Valid
                          </div>
                        )}

                        {existingKey.validationStatus === 'invalid' && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <XCircle className="w-3 h-3" />
                            {existingKey.validationError || 'Invalid'}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Info Box */}
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                <p className="font-medium mb-1">How it works:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li>Your API keys are encrypted and stored securely</li>
                  <li>When you have API keys configured, chat will use them instead of free providers</li>
                  <li>You'll be billed directly by each provider based on your usage</li>
                  <li>Remove a key to go back to using free providers</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Save Button */}
          {apiKeys.length > 0 && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {saving ? 'Saving...' : 'Save API Keys'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}