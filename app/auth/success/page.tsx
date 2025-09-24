'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { CheckCircle2, Copy, Terminal, ArrowRight, User, Bot, MessageSquare, Sparkles, Brain, Zap } from 'lucide-react'

function AuthSuccessContent() {
  const [sessionToken, setSessionToken] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [userName, setUserName] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [isFromCLI, setIsFromCLI] = useState(false)
  const [showProviderSelection, setShowProviderSelection] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check if this came from CLI
    const source = searchParams.get('source')
    const returnTo = searchParams.get('return_to')
    if (source === 'cli' || returnTo === 'terminal') {
      setIsFromCLI(true)
    }

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // Use the access token as the session token
        setSessionToken(session.access_token)

        // Get user details
        if (session.user) {
          setUserEmail(session.user.email || '')
          // Extract username from email or use metadata
          const username = session.user.user_metadata?.full_name ||
                          session.user.email?.split('@')[0] ||
                          'User'
          setUserName(username)
        }

        // If from CLI, save session for CLI polling and show provider selection
        if (isFromCLI) {
          setShowProviderSelection(true)

          // Save CLI session data to database for CLI to poll
          try {
            // First try to delete any existing session for this user
            await supabase
              .from('cli_auth_sessions')
              .delete()
              .eq('user_id', session.user.id);

            // Then insert the new session
            const { error } = await supabase
              .from('cli_auth_sessions')
              .insert({
                user_id: session.user.id,
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                user_email: session.user.email || '',
                expires_at: session.expires_at,
                status: 'authenticated',
                created_at: new Date().toISOString()
              });

            // Session saved silently
          } catch (error) {
            // Error handled silently
          }
        }
      }
    }
    getSession()
  }, [searchParams, isFromCLI])

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider)

    const callbackPort = searchParams.get('callback_port')

    // For CLI users, redirect directly to CLI callback with session authentication
    if (isFromCLI && callbackPort) {
      // Get current session for CLI callback
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const callbackUrl = `http://localhost:${callbackPort}/auth/callback?` +
          new URLSearchParams({
            provider: provider,
            apiKey: session.access_token, // Use session token as "API key" for CLI
            model: getDefaultModel(provider),
            user: JSON.stringify({
              email: session.user.email || '',
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'
            })
          }).toString()

        window.location.href = callbackUrl
        return
      }
    }

    // Fallback for non-CLI users or if no callback port
    localStorage.setItem('selectedLLMProvider', provider)
    localStorage.setItem('userEmail', userEmail)

    const params = new URLSearchParams({
      provider: provider,
      source: 'cli'
    })
    if (callbackPort) {
      params.set('callback_port', callbackPort)
    }
    window.location.href = `/auth/provider-setup?${params.toString()}`
  }

  const getDefaultModel = (provider: string): string => {
    switch (provider) {
      case 'chatgpt': return 'gpt-3.5-turbo'
      case 'claude': return 'claude-3-opus-20240229'
      case 'gemini': return 'gemini-pro'
      case 'perplexity': return 'llama-2-70b-chat'
      default: return 'default'
    }
  }


  const copyToClipboard = () => {
    if (sessionToken) {
      navigator.clipboard.writeText(sessionToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-green-600 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-3xl font-bold mb-2 text-gray-900">Welcome, {userName || 'User'}!</h1>
          <p className="text-gray-600 mb-2">
            {userEmail}
          </p>
          <p className="text-gray-600 mb-8">
            {showProviderSelection ? 'Select your LLM provider to continue' : 'Successfully authenticated with CacheGPT'}
          </p>

          {/* LLM Provider Selection for CLI users */}
          {showProviderSelection && isFromCLI ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-700">Choose Your LLM Provider</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleProviderSelect('chatgpt')}
                  className="p-4 bg-white hover:bg-gray-50 rounded-lg transition-all hover:scale-105 border border-gray-200 hover:border-green-500 shadow-sm group"
                >
                  <Bot className="w-8 h-8 mx-auto mb-2 text-green-600 group-hover:text-green-500" />
                  <div className="font-semibold text-gray-900">ChatGPT</div>
                  <div className="text-xs text-gray-600">OpenAI</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('claude')}
                  className="p-4 bg-white hover:bg-gray-50 rounded-lg transition-all hover:scale-105 border border-gray-200 hover:border-purple-500 shadow-sm group"
                >
                  <Brain className="w-8 h-8 mx-auto mb-2 text-purple-600 group-hover:text-purple-500" />
                  <div className="font-semibold text-gray-900">Claude</div>
                  <div className="text-xs text-gray-600">Anthropic</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('gemini')}
                  className="p-4 bg-white hover:bg-gray-50 rounded-lg transition-all hover:scale-105 border border-gray-200 hover:border-blue-500 shadow-sm group"
                >
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-blue-600 group-hover:text-blue-500" />
                  <div className="font-semibold text-gray-900">Gemini</div>
                  <div className="text-xs text-gray-600">Google</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('perplexity')}
                  className="p-4 bg-white hover:bg-gray-50 rounded-lg transition-all hover:scale-105 border border-gray-200 hover:border-orange-500 shadow-sm group"
                >
                  <Zap className="w-8 h-8 mx-auto mb-2 text-orange-600 group-hover:text-orange-500" />
                  <div className="font-semibold text-gray-900">Perplexity</div>
                  <div className="text-xs text-gray-600">AI Search</div>
                </button>
              </div>

              {selectedProvider && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-green-700 text-sm">
                    ✓ Opening {selectedProvider} authentication in terminal...
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">YOUR SESSION TOKEN</h3>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm shadow-sm"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {sessionToken ? (
                  <div className="font-mono text-xs bg-white border border-gray-200 rounded-lg p-4 break-all text-gray-900">
                    {sessionToken}
                  </div>
                ) : (
                  <div className="font-mono text-xs bg-white border border-gray-200 rounded-lg p-4 text-gray-500">
                    Loading session token...
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Terminal className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-left flex-1">
                    <h3 className="font-semibold mb-2 text-blue-700">Return to Terminal</h3>
                    <ol className="text-sm text-gray-700 space-y-1">
                      <li>1. Copy the session token above</li>
                      <li>2. Go back to your terminal</li>
                      <li>3. Paste the token when prompted</li>
                      <li>4. Select your LLM provider (ChatGPT, Claude, etc.)</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-600 text-sm">
                <ArrowRight className="w-4 h-4" />
                <span>The terminal is waiting for your token</span>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6 text-sm text-gray-600">
          {isFromCLI && showProviderSelection ? (
            'Select your preferred LLM provider above'
          ) : (
            'You can close this window after copying the token'
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Loading...</h1>
            <p className="text-gray-600">Preparing your authentication...</p>
          </div>
        </div>
      </div>
    }>
      <AuthSuccessContent />
    </Suspense>
  )
}