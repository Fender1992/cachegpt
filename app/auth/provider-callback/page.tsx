'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

function ProviderCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [provider, setProvider] = useState('')

  useEffect(() => {
    handleCallback()
  }, [searchParams])

  const handleCallback = async () => {
    try {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')

      if (error) {
        throw new Error(`OAuth error: ${error}`)
      }

      if (!code || !state) {
        throw new Error('Missing authorization code or state parameter')
      }

      // Parse state parameter
      const stateData = JSON.parse(atob(state))
      const { provider: providerName, userEmail, returnTo } = stateData
      setProvider(providerName)

      // Verify user is still authenticated with CacheGPT
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('CacheGPT session expired. Please login again.')
      }

      // Exchange code for tokens using our API route
      const tokenResponse = await fetch('/api/auth/provider-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, provider: providerName, state })
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json()
        throw new Error(error.error || 'Token exchange failed')
      }

      const { accessToken, refreshToken } = await tokenResponse.json()

      // Save OAuth tokens to database
      await supabase
        .from('user_provider_credentials')
        .upsert({
          user_id: session.user.id,
          provider: providerName,
          user_email: userEmail,
          key_name: `${providerName}_oauth`,
          access_token: btoa(accessToken), // Base64 encode for security
          refresh_token: refreshToken ? btoa(refreshToken) : null,
          status: 'ready',
          auto_captured: true,
          oauth_provider: providerName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,provider'
        })

      setStatus('success')
      setMessage(`Successfully connected to ${getProviderDisplayName(providerName)}!`)

      // Redirect after success
      setTimeout(() => {
        if (returnTo === 'cli') {
          router.push('/auth/success?source=cli&provider_setup=complete')
        } else {
          router.push('/dashboard')
        }
      }, 2000)

    } catch (error: any) {
      console.error('Provider OAuth callback error:', error)
      setStatus('error')
      setMessage(error.message || 'Authentication failed')
    }
  }


  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case 'google': return 'Google AI'
      case 'openai': return 'OpenAI'
      case 'claude': return 'Anthropic Claude'
      case 'perplexity': return 'Perplexity'
      default: return provider
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="glass-card rounded-3xl p-8 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-16 h-16 mx-auto mb-6 text-purple-500 animate-spin" />
              <h1 className="text-2xl font-bold mb-4">Connecting to {getProviderDisplayName(provider)}...</h1>
              <p className="text-gray-400">Please wait while we complete the authentication process.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-4 text-green-400">Connection Successful!</h1>
              <p className="text-gray-300 mb-4">{message}</p>
              <p className="text-sm text-gray-500">Redirecting you back to the CLI setup...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-4 text-red-400">Authentication Failed</h1>
              <p className="text-gray-300 mb-6">{message}</p>
              <button
                onClick={() => router.push('/auth/provider-setup?source=cli')}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProviderCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="glass-card rounded-3xl p-8 text-center">
            <Loader2 className="w-16 h-16 mx-auto mb-6 text-purple-500 animate-spin" />
            <h1 className="text-2xl font-bold mb-4">Loading...</h1>
            <p className="text-gray-400">Processing authentication...</p>
          </div>
        </div>
      </div>
    }>
      <ProviderCallbackContent />
    </Suspense>
  )
}