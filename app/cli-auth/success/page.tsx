'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

function CLIAuthSuccessContent() {
  const [provider, setProvider] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const callbackPort = searchParams.get('callback_port')

  useEffect(() => {
    // Add a small delay to ensure session is ready
    const timer = setTimeout(() => {
      checkSession()
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  const checkSession = async () => {
    let { data: { session }, error } = await supabase.auth.getSession()

    // If no session, try to get it from localStorage or URL hash
    if (!session || !session.access_token) {
      // Check if we have auth data in the URL hash (from OAuth redirect)
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {

        // Try to set session from URL (this is important!)
        const { data, error: urlError } = await supabase.auth.setSession({
          access_token: '', // This will trigger Supabase to read from URL
          refresh_token: ''
        }).catch(async () => {
          // If setSession fails, try to exchange code for session
          return await supabase.auth.exchangeCodeForSession(window.location.href)
        })

        if (data?.session) {
          // Update our local session variable
          session = data.session
        } else {
          console.error('[ERROR] Failed to get session from URL:', urlError)
        }
      }

      // If still no session, try one more time to get it
      if (!session || !session.access_token) {
        const { data: { session: finalSession }, error: finalError } = await supabase.auth.getSession()
        if (finalSession && finalSession.access_token) {
          session = finalSession
        } else {
          console.error('[ERROR] Final attempt failed:', finalError)
        }
      }
    }

    if (session) {
      // Auto-close after 3 seconds (only if no callback port)
      if (!callbackPort) {
        setTimeout(() => {
          try {
            window.close()
          } catch (e) {
            // Can't close programmatically
          }
        }, 3000)
      }
    }
  }

  const selectProvider = async (selectedProvider: string) => {
    setProvider(selectedProvider)

    const { data: { session }, error } = await supabase.auth.getSession()

    // CRITICAL FIX: Even if session exists but no access_token, we can't proceed
    if (!session || !session.access_token) {
      console.error('[ERROR] No session or no access token available!')

      // Try to get it from the database as a fallback
      if (session?.user?.id) {
        const { data: cliSession } = await supabase
          .from('cli_auth_sessions')
          .select('access_token')
          .eq('user_id', session.user.id)
          .single()

        if (cliSession?.access_token) {
          // Use the token from database
          session.access_token = cliSession.access_token
        } else {
          console.error('[ERROR] No token in database either!')
        }
      }
    }

    if (session && session.access_token) {
      // Save provider selection to user profile
      await supabase
        .from('user_profiles')
        .upsert({
          user_id: session.user.id,
          selected_provider: selectedProvider,
          selected_model: getDefaultModel(selectedProvider),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (callbackPort) {
        // Build callback parameters
        const params: Record<string, string> = {
          provider: selectedProvider,
          model: getDefaultModel(selectedProvider),
          user: JSON.stringify({
            email: session.user.email || '',
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'
          })
        }

        // Add token with fallback options
        if (session.access_token) {
          params.sessionToken = session.access_token
          params.authToken = session.access_token // Send as both for compatibility
        } else {
          console.error('[ERROR] No access token in session!')
          params.error = 'No access token available'
        }

        // Send session token for keyless authentication
        const callbackUrl = `http://localhost:${callbackPort}/auth/callback?` + new URLSearchParams(params).toString()

        window.location.href = callbackUrl
        return
      }

      // Fallback: Save provider selection and close
      await supabase.from('user_provider_credentials').upsert({
        user_id: session.user.id,
        provider: selectedProvider,
        user_email: session.user.email || '',
        status: 'ready',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      })

      // Show success and close
      setTimeout(() => {
        try {
          window.close()
        } catch (e) {
          // Can't close programmatically
        }
      }, 1000)
    }
  }

  const getDefaultModel = (provider: string): string => {
    switch (provider) {
      case 'chatgpt': return 'gpt-5'
      case 'claude': return 'claude-opus-4-1-20250805'
      case 'gemini': return 'gemini-2.0-ultra'
      case 'perplexity': return 'pplx-pro-online'
      default: return 'default'
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl text-center">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-2">Authentication Successful!</h1>

          {!provider ? (
            <>
              <p className="text-gray-400 mb-8">Select your LLM provider:</p>
              <p className="text-xs text-gray-500 mb-4">Callback port: {callbackPort || 'Not specified'}</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => selectProvider('chatgpt')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-green-400 text-2xl mb-2">🤖</div>
                  <div className="font-semibold">ChatGPT</div>
                </button>

                <button
                  onClick={() => selectProvider('claude')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-purple-400 text-2xl mb-2">🧠</div>
                  <div className="font-semibold">Claude</div>
                </button>

                <button
                  onClick={() => selectProvider('gemini')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-blue-400 text-2xl mb-2">✨</div>
                  <div className="font-semibold">Gemini</div>
                </button>

                <button
                  onClick={() => selectProvider('perplexity')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-orange-400 text-2xl mb-2">⚡</div>
                  <div className="font-semibold">Perplexity</div>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">Provider selected: {provider}</p>
              <p className="text-gray-300">You can close this window and return to the terminal.</p>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-sm text-gray-500">
              This window will close automatically...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CLIAuthSuccess() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <CLIAuthSuccessContent />
    </Suspense>
  )
}