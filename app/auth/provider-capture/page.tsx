'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PROVIDER_CAPTURE_CONFIGS } from '@/lib/key-capture'
import { Loader2, ExternalLink, CheckCircle2, AlertCircle, Eye } from 'lucide-react'

function ProviderCaptureContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'monitoring' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [countdown, setCountdown] = useState(5)

  const provider = searchParams.get('provider')
  const sessionId = searchParams.get('session')
  const targetUrl = searchParams.get('target')

  const config = provider ? PROVIDER_CAPTURE_CONFIGS[provider as keyof typeof PROVIDER_CAPTURE_CONFIGS] : null

  useEffect(() => {
    if (!provider || !config || !sessionId || !targetUrl) {
      setStatus('error')
      setMessage('Invalid capture parameters')
      return
    }

    setStatus('redirecting')
    setMessage(`Redirecting you to ${config.name}...`)

    // Countdown before redirect
    let count = 5
    const countdownInterval = setInterval(() => {
      count--
      setCountdown(count)
      if (count <= 0) {
        clearInterval(countdownInterval)
        redirectToProvider()
      }
    }, 1000)

    return () => clearInterval(countdownInterval)
  }, [provider, config, sessionId, targetUrl])

  const redirectToProvider = () => {
    if (!config || !sessionId) return

    setStatus('monitoring')
    setMessage(`Please sign in to ${config.name} in the new tab...`)

    // Open provider site in a new tab
    const providerWindow = window.open(decodeURIComponent(targetUrl!), '_blank')

    if (!providerWindow) {
      setStatus('error')
      setMessage('Please allow popups and try again')
      return
    }

    // Monitor for authentication completion
    startMonitoring(providerWindow)
  }

  const startMonitoring = async (providerWindow: Window) => {
    let attempts = 0
    const maxAttempts = 120 // 10 minutes

    const checkAuth = async () => {
      attempts++

      try {
        // Check if the provider window is still open
        if (providerWindow.closed) {
          setStatus('error')
          setMessage('Authentication window was closed. Please try again.')
          return
        }

        // Check our API for captured authentication
        const response = await fetch(`/api/auth/capture-key?session=${sessionId}`)
        if (response.status === 429) {
          // Rate limited - wait much longer before next attempt
          setTimeout(checkAuth, 30000) // Wait 30 seconds
          return
        }

        const result = await response.json()

        if (result.success && (result.apiKey || result.sessionToken)) {
          // Successfully captured authentication
          providerWindow.close()
          setStatus('success')
          setMessage(`Successfully authenticated with ${config?.name}!`)

          // Close this window after 2 seconds
          setTimeout(() => {
            window.close()
          }, 2000)
          return
        }

        if (!result.waiting && result.error) {
          // Capture failed
          providerWindow.close()
          setStatus('error')
          setMessage(result.error)
          return
        }

        // Still waiting, try again
        if (attempts < maxAttempts) {
          setTimeout(checkAuth, 20000) // Check every 20 seconds
        } else {
          providerWindow.close()
          setStatus('error')
          setMessage('Authentication timeout. Please try again.')
        }

      } catch (error: any) {
        if (attempts < maxAttempts) {
          setTimeout(checkAuth, 20000)
        } else {
          providerWindow.close()
          setStatus('error')
          setMessage('Network error during authentication')
        }
      }
    }

    // Start checking after 10 seconds to give the provider page time to load
    setTimeout(checkAuth, 10000)
  }

  const manualInstructions = config ? [
    `Go to ${decodeURIComponent(targetUrl || '')}`,
    `Sign in to your ${config.name} account`,
    'If you have an API key, it should be detected automatically',
    'Keep this window open until authentication completes'
  ] : []

  if (!provider || !config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Invalid Request</h1>
          <p className="text-gray-600 mb-6">Missing or invalid provider information.</p>
          <button
            onClick={() => window.close()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            Close Window
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8">
          {status === 'loading' && (
            <>
              <div className="text-center mb-8">
                <Loader2 className="w-16 h-16 mx-auto mb-6 text-blue-600 animate-spin" />
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Preparing Authentication</h1>
                <p className="text-gray-600">Setting up {config.name} authentication...</p>
              </div>
            </>
          )}

          {status === 'redirecting' && (
            <>
              <div className="text-center mb-8">
                <ExternalLink className="w-16 h-16 mx-auto mb-6 text-blue-600" />
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Redirecting to {config.name}</h1>
                <p className="text-gray-600 mb-4">{message}</p>
                <p className="text-sm text-gray-500">Redirecting in {countdown} seconds...</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-blue-700 mb-4">What happens next:</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  {config.instructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {status === 'monitoring' && (
            <>
              <div className="text-center mb-8">
                <Eye className="w-16 h-16 mx-auto mb-6 text-blue-600" />
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Monitoring Authentication</h1>
                <p className="text-gray-600">{message}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-amber-700 mb-4">Manual Instructions:</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  {manualInstructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-amber-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="text-center">
                <button
                  onClick={() => window.open(decodeURIComponent(targetUrl!), '_blank')}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  Open {config.name} Again
                </button>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 bg-green-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Authentication Successful!</h1>
                <p className="text-gray-700 mb-4">{message}</p>
                <p className="text-sm text-gray-500">This window will close automatically...</p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 bg-red-600 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Authentication Failed</h1>
                <p className="text-gray-700 mb-6">{message}</p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.close()}
                  className="flex-1 py-3 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
                >
                  Close Window
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProviderCapturePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    }>
      <ProviderCaptureContent />
    </Suspense>
  )
}