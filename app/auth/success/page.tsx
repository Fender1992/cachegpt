'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { CheckCircle2, Copy, Terminal, ArrowRight, User, Bot, MessageSquare, Sparkles, Brain, Zap } from 'lucide-react'

export default function AuthSuccessPage() {
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

        // If from CLI, show provider selection instead of auto-closing
        if (isFromCLI) {
          setShowProviderSelection(true)
        }
      }
    }
    getSession()
  }, [searchParams, isFromCLI])

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider)

    // Send message to CLI with selected provider and token
    if (window.opener) {
      window.opener.postMessage({
        type: 'provider_selected',
        provider: provider,
        token: sessionToken,
        userEmail: userEmail
      }, '*')
    }

    // Send to the local CLI server via multiple methods
    const sendCallback = async () => {
      const callbackData = {
        provider: provider,
        email: userEmail,
        userName: userName,
        sessionToken: sessionToken
      };

      console.log('Sending authentication callback...', { provider, email: userEmail });

      // Try multiple ports and methods
      const attempts = [];

      // POST requests
      for (let port = 3001; port <= 3010; port++) {
        attempts.push(
          fetch(`http://localhost:${port}/auth/callback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(callbackData)
          }).then(response => {
            console.log(`POST callback to port ${port} responded:`, response.status);
            return response;
          }).catch(err => {
            console.log(`POST callback to port ${port} failed:`, err.message);
            return null;
          })
        );

        // GET requests as fallback
        const params = new URLSearchParams({
          provider: provider,
          email: userEmail,
          userName: userName || '',
          sessionToken: sessionToken || ''
        });

        attempts.push(
          fetch(`http://localhost:${port}/provider-selected?${params}`).then(response => {
            console.log(`GET callback to port ${port} responded:`, response.status);
            return response;
          }).catch(err => {
            console.log(`GET callback to port ${port} failed:`, err.message);
            return null;
          })
        );
      }

      // Wait for any successful response
      try {
        await Promise.allSettled(attempts);
        console.log('All callback attempts completed');
      } catch (e) {
        console.log('Callback error:', e);
      }
    };

    // Send callback without blocking UI
    sendCallback();

    // Store provider selection
    localStorage.setItem('selectedLLMProvider', provider)
    localStorage.setItem('userEmail', userEmail)

    // Close window after selection with multiple attempts
    const closeWindow = () => {
      try {
        window.close();
      } catch (e) {
        // If window.close() fails, try other methods
        try {
          if (window.opener) {
            window.opener.focus();
          }
        } catch (e2) {
          console.log('Could not focus opener window');
        }
      }
    };

    // Multiple close attempts
    setTimeout(closeWindow, 500);
    setTimeout(closeWindow, 1500);
    setTimeout(closeWindow, 3000);
  }

  const copyToClipboard = () => {
    if (sessionToken) {
      navigator.clipboard.writeText(sessionToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="glass-card rounded-3xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-3xl font-bold mb-2">Welcome, {userName || 'User'}!</h1>
          <p className="text-gray-400 mb-2">
            {userEmail}
          </p>
          <p className="text-gray-400 mb-8">
            {showProviderSelection ? 'Select your LLM provider to continue' : 'Successfully authenticated with CacheGPT'}
          </p>

          {/* LLM Provider Selection for CLI users */}
          {showProviderSelection && isFromCLI ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Choose Your LLM Provider</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleProviderSelect('chatgpt')}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-green-500/50 group"
                >
                  <Bot className="w-8 h-8 mx-auto mb-2 text-green-500 group-hover:text-green-400" />
                  <div className="font-semibold">ChatGPT</div>
                  <div className="text-xs text-gray-500">OpenAI</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('claude')}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-purple-500/50 group"
                >
                  <Brain className="w-8 h-8 mx-auto mb-2 text-purple-500 group-hover:text-purple-400" />
                  <div className="font-semibold">Claude</div>
                  <div className="text-xs text-gray-500">Anthropic</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('gemini')}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-blue-500/50 group"
                >
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-blue-500 group-hover:text-blue-400" />
                  <div className="font-semibold">Gemini</div>
                  <div className="text-xs text-gray-500">Google</div>
                </button>

                <button
                  onClick={() => handleProviderSelect('perplexity')}
                  className="p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-all hover:scale-105 border border-gray-700 hover:border-orange-500/50 group"
                >
                  <Zap className="w-8 h-8 mx-auto mb-2 text-orange-500 group-hover:text-orange-400" />
                  <div className="font-semibold">Perplexity</div>
                  <div className="text-xs text-gray-500">AI Search</div>
                </button>
              </div>

              {selectedProvider && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="text-green-400 text-sm">
                    ✓ Opening {selectedProvider} authentication in terminal...
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="bg-gray-800/50 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-400">YOUR SESSION TOKEN</h3>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {sessionToken ? (
                  <div className="font-mono text-xs bg-black/50 rounded-lg p-4 break-all text-gray-300">
                    {sessionToken}
                  </div>
                ) : (
                  <div className="font-mono text-xs bg-black/50 rounded-lg p-4 text-gray-500">
                    Loading session token...
                  </div>
                )}
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Terminal className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div className="text-left flex-1">
                    <h3 className="font-semibold mb-2 text-blue-400">Return to Terminal</h3>
                    <ol className="text-sm text-gray-300 space-y-1">
                      <li>1. Copy the session token above</li>
                      <li>2. Go back to your terminal</li>
                      <li>3. Paste the token when prompted</li>
                      <li>4. Select your LLM provider (ChatGPT, Claude, etc.)</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
                <ArrowRight className="w-4 h-4" />
                <span>The terminal is waiting for your token</span>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6 text-sm text-gray-500">
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