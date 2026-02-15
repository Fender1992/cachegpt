'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase-client'
import {
  Key, Save, Trash2, Eye, EyeOff, Plus,
  AlertCircle, Check, ChevronLeft, CheckCircle, XCircle, Loader2,
  ChevronDown, User, Palette, Shield, Moon, Sun, Sparkles, LogOut
} from 'lucide-react'
import { validateApiKeyFormat, testApiKeyConnection } from '@/lib/api-key-validator'
import CacheGPTApiKeys from '@/components/settings/cachegpt-api-keys'
import SubscriptionInfo from '@/components/settings/subscription-info'
import IntegrationCard from '@/components/settings/IntegrationCard'
import DiscordIntegrationCard from '@/components/settings/DiscordIntegrationCard'
import GmailIntegrationCard from '@/components/settings/GmailIntegrationCard'
import CalendarIntegrationCard from '@/components/settings/CalendarIntegrationCard'
import SlackIntegrationCard from '@/components/settings/SlackIntegrationCard'
import TeamsIntegrationCard from '@/components/settings/TeamsIntegrationCard'
import NotionIntegrationCard from '@/components/settings/NotionIntegrationCard'
import DriveIntegrationCard from '@/components/settings/DriveIntegrationCard'
import JiraIntegrationCard from '@/components/settings/JiraIntegrationCard'
import { telemetry } from '@/lib/telemetry'
import Navigation from '@/components/Navigation'

type Tab = 'profile' | 'api-keys' | 'integrations' | 'themes' | 'privacy'
type Theme = 'light' | 'dark' | 'solarized' | 'neon'

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

const INTEGRATIONS = [
  { key: 'github', label: 'GitHub', icon: '🐙' },
  { key: 'discord', label: 'Discord', icon: '💬' },
  { key: 'gmail', label: 'Gmail', icon: '📧' },
  { key: 'calendar', label: 'Google Calendar', icon: '📅' },
  { key: 'slack', label: 'Slack', icon: '💼' },
  { key: 'teams', label: 'Microsoft Teams', icon: '👥' },
  { key: 'notion', label: 'Notion', icon: '📝' },
  { key: 'drive', label: 'Google Drive', icon: '📁' },
  { key: 'jira', label: 'Jira', icon: '🎯' },
] as { key: string; label: string; icon: string; comingSoon?: boolean }[]

const THEMES = [
  { id: 'light' as Theme, name: 'Light', icon: Sun, colors: 'bg-white border-gray-200' },
  { id: 'dark' as Theme, name: 'Dark', icon: Moon, colors: 'bg-gray-900 border-gray-700' },
  { id: 'solarized' as Theme, name: 'Solarized', icon: Sparkles, colors: 'bg-amber-50 border-amber-200' },
  { id: 'neon' as Theme, name: 'Neon', icon: Sparkles, colors: 'bg-purple-950 border-purple-500' },
]

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  { id: 'api-keys', label: 'API Keys', icon: <Key className="w-4 h-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <ChevronDown className="w-4 h-4" /> },
  { id: 'themes', label: 'Themes', icon: <Palette className="w-4 h-4" /> },
  { id: 'privacy', label: 'Privacy', icon: <Shield className="w-4 h-4" /> },
]

function IntegrationsAccordion({ userId }: { userId: string }) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const renderCard = (key: string) => {
    switch (key) {
      case 'github': return <IntegrationCard provider="github" userId={userId} />
      case 'discord': return <DiscordIntegrationCard userId={userId} />
      case 'gmail': return <GmailIntegrationCard userId={userId} />
      case 'calendar': return <CalendarIntegrationCard userId={userId} />
      case 'slack': return <SlackIntegrationCard userId={userId} />
      case 'teams': return <TeamsIntegrationCard userId={userId} />
      case 'notion': return <NotionIntegrationCard userId={userId} />
      case 'drive': return <DriveIntegrationCard userId={userId} />
      case 'jira': return <JiraIntegrationCard userId={userId} />
      default: return null
    }
  }

  return (
    <div className="space-y-2">
      {INTEGRATIONS.map(({ key, label, icon, comingSoon }) => {
        const isOpen = openItems.has(key)
        return (
          <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">{label}</span>
                {comingSoon && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                    Coming Soon
                  </span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="border-t border-gray-200 dark:border-gray-700 [&>div]:rounded-none [&>div]:shadow-none [&>div]:border-0">
                {renderCard(key)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}

function SettingsContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [enterpriseMode, setEnterpriseMode] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      loadUserSettings()
      telemetry.settingsView()
    }
  }, [user])

  // Handle ?tab= query param
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab as Tab)
    }
  }, [searchParams])

  const loadUserSettings = async () => {
    try {
      // Load user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single()

      if (profile) {
        setUserProfile(profile)
        if (profile.enterprise_mode) {
          setEnterpriseMode(true)
        }
      }

      // Load saved theme
      const savedTheme = localStorage.getItem('theme') as Theme
      if (savedTheme) {
        setTheme(savedTheme)
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
          api_key: atob(cred.api_key),
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

    setApiKeys(apiKeys.map(k =>
      k.provider === provider
        ? { ...k, validationStatus: 'testing', validationError: undefined }
        : k
    ))

    const formatCheck = validateApiKeyFormat(provider, key.api_key)
    if (!formatCheck.valid) {
      setApiKeys(apiKeys.map(k =>
        k.provider === provider
          ? { ...k, validationStatus: 'invalid', validationError: formatCheck.error }
          : k
      ))
      return
    }

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
      if (!enterpriseMode && apiKeys.length > 0) {
        await supabase
          .from('user_profiles')
          .update({ enterprise_mode: true })
          .eq('user_id', user.id)
        setEnterpriseMode(true)
      }

      for (const key of apiKeys) {
        if (key.api_key) {
          await supabase
            .from('user_provider_credentials')
            .upsert({
              user_id: user.id,
              user_email: user.email,
              provider: mapProviderName(key.provider),
              api_key: btoa(key.api_key),
              status: 'ready',
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,provider'
            })
        }
      }

      showMessageBanner('success', 'API keys saved successfully!')

      setTimeout(() => {
        loadUserSettings()
        setShowKeys({})
      }, 1500)
    } catch (error: any) {
      showMessageBanner('error', error.message || 'Failed to save API keys')
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

  const applyTheme = (themeName: Theme) => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'theme-solarized', 'theme-neon')

    if (themeName === 'light') {
      root.classList.add('light')
    } else if (themeName === 'dark') {
      root.classList.add('dark')
    } else if (themeName === 'solarized') {
      root.classList.add('theme-solarized')
    } else if (themeName === 'neon') {
      root.classList.add('theme-neon')
    }

    localStorage.setItem('theme', themeName)
  }

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    applyTheme(newTheme)
    telemetry.themeChanged(newTheme)
    showMessageBanner('success', `Theme changed to ${newTheme}`)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const showMessageBanner = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/chat')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition mb-4"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Chat
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Settings
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Customize your CacheGPT experience
            </p>
          </div>

          {/* Message Banner */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
            }`}>
              {message.type === 'success' ? (
                <Check className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              {message.text}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Your Profile</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email
                    </label>
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-gray-900 dark:text-white">
                      {user?.email}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Account Type
                    </label>
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-gray-900 dark:text-white">
                      {userProfile?.subscription_tier?.charAt(0).toUpperCase() + userProfile?.subscription_tier?.slice(1) || 'Free'} Plan
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription Info */}
              {user && <SubscriptionInfo userId={user.id} />}

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}

          {/* API Keys Tab */}
          {activeTab === 'api-keys' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                  <Key className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                    Your API Keys
                  </h2>
                </div>

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

              {/* CacheGPT API Keys */}
              <CacheGPTApiKeys />
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && user && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Integrations</h2>
              <IntegrationsAccordion userId={user.id} />
            </div>
          )}

          {/* Themes Tab */}
          {activeTab === 'themes' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Choose Your Theme</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Pick a theme that makes you happy! Changes apply instantly.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {THEMES.map((themeOption) => {
                  const Icon = themeOption.icon
                  return (
                    <button
                      key={themeOption.id}
                      onClick={() => handleThemeChange(themeOption.id)}
                      className={`p-6 rounded-xl border-2 transition-all ${
                        theme === themeOption.id
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-lg ${themeOption.colors} border-2 flex items-center justify-center`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-gray-900 dark:text-white">{themeOption.name}</div>
                          {theme === themeOption.id && (
                            <div className="text-sm text-purple-600 dark:text-purple-400">Active</div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Your Privacy Matters</h2>

              <div className="space-y-6 text-gray-700 dark:text-gray-300">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What we store</h3>
                  <ul className="space-y-2 list-disc list-inside">
                    <li>Your chat messages (to show you your history)</li>
                    <li>Your email (to identify your account)</li>
                    <li>Your AI provider preference (OpenAI, Claude, etc.)</li>
                    <li>Your API keys if you add them (encrypted)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What we don&apos;t do</h3>
                  <ul className="space-y-2 list-disc list-inside">
                    <li>We don&apos;t sell your data to anyone. Ever.</li>
                    <li>We don&apos;t train AI models on your conversations</li>
                    <li>We don&apos;t share your messages with third parties</li>
                    <li>We don&apos;t track you across other websites</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Your data, your control</h3>
                  <p className="mb-3">
                    You can delete your account and all your data anytime. Just email us at{' '}
                    <a href="mailto:privacy@cachegpt.app" className="text-purple-600 hover:underline">
                      privacy@cachegpt.app
                    </a>
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Read our full{' '}
                    <a href="/privacy" className="text-purple-600 hover:underline">
                      Privacy Policy
                    </a>
                    {' '}and{' '}
                    <a href="/terms" className="text-purple-600 hover:underline">
                      Terms of Service
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
