'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bot, Brain, Sparkles, Zap, Key, ArrowRight, CheckCircle2, ExternalLink, Shield } from 'lucide-react'

function ProviderSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'select' | 'configure' | 'oauth'>('select')

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login?source=cli&return_to=terminal')
      return
    }
    setUserEmail(session.user.email || '')
  }

  const checkProviderOAuth = async (provider: string): Promise<boolean> => {
    // Providers that support auto key capture (preferred over OAuth for now)
    const autoCaptureProviders = ['claude', 'openai', 'perplexity']
    const oauthProviders = ['google'] // Only Google has proper OAuth for AI

    // Prefer auto-capture over OAuth for better UX
    return autoCaptureProviders.includes(provider) || oauthProviders.includes(provider)
  }

  const handleProviderOAuth = async (provider: string) => {
    setIsLoading(true)
    try {
      // Generate session ID for capture
      const sessionId = `capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Check if provider supports auto-capture
      const autoCaptureProviders = ['claude', 'openai', 'perplexity']

      if (autoCaptureProviders.includes(provider)) {
        // Redirect to auto-capture flow
        window.location.href = `/auth/key-capture?provider=${provider}&session=${sessionId}&source=cli`
        return
      }

      // For Google, use OAuth
      if (provider === 'google') {
        const state = btoa(JSON.stringify({
          provider,
          userEmail,
          returnTo: 'cli',
          timestamp: Date.now()
        }))

        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        const redirectUri = encodeURIComponent(`${window.location.origin}/auth/provider-callback`)
        const scopes = encodeURIComponent('https://www.googleapis.com/auth/generative-language')

        const oauthUrl = `https://accounts.google.com/oauth2/auth?` +
          `client_id=${clientId}&` +
          `redirect_uri=${redirectUri}&` +
          `scope=${scopes}&` +
          `response_type=code&` +
          `state=${state}&` +
          `access_type=offline&` +
          `prompt=consent`

        window.location.href = oauthUrl
        return
      }

    } catch (error: any) {
      setError('Failed to initiate authentication: ' + error.message)
      setIsLoading(false)
    }
  }

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider)
    setError(null)

    // Check if provider supports OAuth or needs API key
    const supportsOAuth = await checkProviderOAuth(provider)

    if (supportsOAuth) {
      // Show OAuth option first
      setStep('oauth')
    } else {
      // Go directly to API key setup
      setStep('configure')
    }
  }

  const getProviderInstructions = (provider: string) => {
    switch (provider) {
      case 'chatgpt':
        return {
          title: 'OpenAI API Key',
          instructions: [
            'Go to https://platform.openai.com/api-keys',
            'Sign in or create an OpenAI account',
            'Click "Create new secret key"',
            'Copy the key (it starts with sk-...)',
            'Paste it below'
          ],
          placeholder: 'sk-...'
        }
      case 'claude':
        return {
          title: 'Anthropic API Key',
          instructions: [
            'Go to https://console.anthropic.com/settings/keys',
            'Sign in or create an Anthropic account',
            'Click "Create Key"',
            'Copy the key',
            'Paste it below'
          ],
          placeholder: 'sk-ant-...'
        }
      case 'gemini':
        return {
          title: 'Google AI API Key',
          instructions: [
            'Go to https://makersuite.google.com/app/apikey',
            'Sign in with your Google account',
            'Click "Create API Key"',
            'Copy the key',
            'Paste it below'
          ],
          placeholder: 'AIza...'
        }
      case 'perplexity':
        return {
          title: 'Perplexity API Key',
          instructions: [
            'Go to https://www.perplexity.ai/settings/api',
            'Sign in or create a Perplexity account',
            'Generate an API key',
            'Copy the key',
            'Paste it below'
          ],
          placeholder: 'pplx-...'
        }
      default:
        return {
          title: 'API Key',
          instructions: ['Enter your API key'],
          placeholder: 'Enter your API key'
        }
    }
  }

  const handleSaveCredentials = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        throw new Error('Not authenticated')
      }

      // Delete any existing credentials for this provider
      await supabase
        .from('user_provider_credentials')
        .delete()
        .eq('user_id', session.user.id)
        .eq('provider', selectedProvider)

      // Save the new credentials
      const { error: saveError } = await supabase
        .from('user_provider_credentials')
        .insert({
          user_id: session.user.id,
          provider: selectedProvider,
          user_email: userEmail,
          key_name: `${selectedProvider}_api_key`,
          api_key: btoa(apiKey), // Base64 encode for security
          status: 'ready',
          auto_captured: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (saveError) {
        throw saveError
      }

      // Success - redirect to success page
      router.push('/cli-auth/success?setup=complete')

    } catch (error: any) {
      // Error handled through UI
      setError(error.message || 'Failed to save credentials')
    } finally {
      setIsLoading(false)
    }
  }

  const instructions = selectedProvider ? getProviderInstructions(selectedProvider) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="glass-card rounded-3xl p-8">
          {step === 'select' ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">Select Your LLM Provider</h1>
                <p className="text-gray-400">Choose the AI service you want to use with CacheGPT</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleProviderSelect('chatgpt')}
                  className="p-6 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-green-500/50 group"
                >
                  <Bot className="w-10 h-10 mx-auto mb-3 text-green-500 group-hover:text-green-400" />
                  <div className="font-semibold text-lg">ChatGPT</div>
                  <div className="text-sm text-gray-500">OpenAI GPT-4</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('claude')}
                  className="p-6 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-purple-500/50 group"
                >
                  <Brain className="w-10 h-10 mx-auto mb-3 text-purple-500 group-hover:text-purple-400" />
                  <div className="font-semibold text-lg">Claude</div>
                  <div className="text-sm text-gray-500">Anthropic</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('gemini')}
                  className="p-6 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-blue-500/50 group"
                >
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-blue-500 group-hover:text-blue-400" />
                  <div className="font-semibold text-lg">Gemini</div>
                  <div className="text-sm text-gray-500">Google AI</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('perplexity')}
                  className="p-6 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-orange-500/50 group"
                >
                  <Zap className="w-10 h-10 mx-auto mb-3 text-orange-500 group-hover:text-orange-400" />
                  <div className="font-semibold text-lg">Perplexity</div>
                  <div className="text-sm text-gray-500">AI Search</div>
                </button>
              </div>
            </>
          ) : step === 'oauth' ? (
            <>
              <button
                onClick={() => {
                  setStep('select')
                  setSelectedProvider(null)
                  setError(null)
                }}
                className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
              >
                ← Back to providers
              </button>

              <div className="text-center mb-8">
                <Shield className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h1 className="text-2xl font-bold mb-2">Connect to {selectedProvider === 'chatgpt' ? 'OpenAI' : selectedProvider === 'claude' ? 'Anthropic' : selectedProvider === 'gemini' ? 'Google' : 'Perplexity'}</h1>
                <p className="text-gray-400">Choose how you want to authenticate</p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="p-6 bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-green-400 mb-2">
                        {['claude', 'openai', 'perplexity'].includes(selectedProvider!) ?
                          '🔐 Auto-Capture (Recommended)' :
                          '🔐 OAuth Authentication (Recommended)'
                        }
                      </h3>
                      <p className="text-sm text-gray-300">
                        {['claude', 'openai', 'perplexity'].includes(selectedProvider!) ?
                          'Automatically capture your API key from the provider console' :
                          'Secure login directly through the provider'
                        }
                      </p>
                    </div>
                    <ExternalLink className="w-6 h-6 text-green-400" />
                  </div>
                  <button
                    onClick={() => handleProviderOAuth(selectedProvider!)}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {['claude', 'openai', 'perplexity'].includes(selectedProvider!) ?
                      `Auto-Capture from ${selectedProvider === 'openai' ? 'OpenAI' : selectedProvider === 'claude' ? 'Anthropic' : 'Perplexity'}` :
                      'Connect with Google OAuth'
                    }
                  </button>
                </div>

                <div className="text-center text-gray-500">
                  <div className="flex items-center">
                    <div className="flex-1 border-t border-gray-700"></div>
                    <span className="px-3 text-sm">or</span>
                    <div className="flex-1 border-t border-gray-700"></div>
                  </div>
                </div>

                <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-300 mb-2">🔑 API Key</h3>
                      <p className="text-sm text-gray-400">Use your existing API key</p>
                    </div>
                    <Key className="w-6 h-6 text-gray-400" />
                  </div>
                  <button
                    onClick={() => setStep('configure')}
                    className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                  >
                    Enter API Key Instead
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setStep('oauth')
                  setApiKey('')
                  setError(null)
                }}
                className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
              >
                ← Back to authentication options
              </button>

              <div className="text-center mb-8">
                <Key className="w-12 h-12 mx-auto mb-4 text-purple-500" />
                <h1 className="text-2xl font-bold mb-2">{instructions?.title}</h1>
                <p className="text-gray-400">Follow these steps to get your API key</p>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-6 mb-6">
                <h3 className="font-semibold mb-4 text-gray-300">Instructions:</h3>
                <ol className="space-y-2">
                  {instructions?.instructions.map((step, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-600/20 text-purple-400 rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </span>
                      <span className="text-gray-300 text-sm">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium mb-2 text-gray-300">
                    API Key
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={instructions?.placeholder}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
                    disabled={isLoading}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSaveCredentials}
                  disabled={isLoading || !apiKey.trim()}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      Save and Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-sm text-blue-400">
                  💡 Your API key will be encrypted and stored securely. It will only be used for your CLI sessions.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6 text-sm text-gray-500">
          {step === 'select'
            ? "You'll need an API key from your chosen provider"
            : "Your credentials will be synced to the terminal automatically"
          }
        </div>
      </div>
    </div>
  )
}

export default function ProviderSetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-white mb-2">Loading...</h1>
          <p className="text-gray-400">Preparing provider setup...</p>
        </div>
      </div>
    }>
      <ProviderSetupContent />
    </Suspense>
  )
}