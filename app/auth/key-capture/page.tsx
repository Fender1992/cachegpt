'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PROVIDER_CAPTURE_CONFIGS } from '@/lib/key-capture'
import { ExternalLink, Key, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

function KeyCaptureContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'instructions' | 'capturing' | 'success' | 'error'>('instructions')
  const [message, setMessage] = useState('')
  const [countdown, setCountdown] = useState(3)

  const provider = searchParams.get('provider')
  const sessionId = searchParams.get('session')

  const config = provider ? PROVIDER_CAPTURE_CONFIGS[provider as keyof typeof PROVIDER_CAPTURE_CONFIGS] : null

  useEffect(() => {
    if (!provider || !config || !sessionId) {
      setStatus('error')
      setMessage('Invalid capture parameters')
      return
    }
  }, [provider, config, sessionId])

  const startCapture = async () => {
    if (!config || !sessionId) return

    setStatus('capturing')
    setMessage('Opening provider login...')

    // Generate capture URL with session tracking
    const captureUrl = `${config.keyPageUrl}?session=${sessionId}&auto_capture=true`

    // Open the provider login in a new window
    const captureWindow = window.open(captureUrl, 'key_capture', 'width=800,height=600,scrollbars=yes,resizable=yes')

    if (!captureWindow) {
      setStatus('error')
      setMessage('Please allow popups and try again')
      return
    }

    // Poll for capture results
    let attempts = 0
    const maxAttempts = 120 // 2 minutes

    const pollInterval = setInterval(async () => {
      attempts++

      try {
        const response = await fetch(`/api/auth/capture-key?session=${sessionId}`)
        const result = await response.json()

        if (result.waiting) {
          // Still waiting
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval)
            captureWindow.close()
            setStatus('error')
            setMessage('Capture timeout. Please try again or use manual API key entry.')
          }
          return
        }

        // Got a result
        clearInterval(pollInterval)
        captureWindow.close()

        if (result.success && result.apiKey) {
          setStatus('success')
          setMessage(`Successfully captured ${config.name} API key!`)

          // Countdown and redirect
          let count = 3
          setCountdown(count)
          const countdownInterval = setInterval(() => {
            count--
            setCountdown(count)
            if (count <= 0) {
              clearInterval(countdownInterval)
              router.push('/auth/success?source=cli&provider_setup=complete')
            }
          }, 1000)

        } else {
          setStatus('error')
          setMessage(result.error || 'Key capture failed')
        }

      } catch (error: any) {
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval)
          captureWindow.close()
          setStatus('error')
          setMessage('Network error during capture')
        }
      }
    }, 1000)

    // Update status message
    setMessage(`Please sign in to your ${config.name} account in the popup window...`)
  }

  const handleManualEntry = () => {
    router.push(`/auth/provider-setup?provider=${provider}&source=cli&step=manual`)
  }

  if (!provider || !config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-card rounded-3xl p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
          <h1 className="text-2xl font-bold mb-4 text-red-400">Invalid Request</h1>
          <p className="text-gray-300 mb-6">Missing or invalid provider information.</p>
          <button
            onClick={() => router.push('/auth/provider-setup?source=cli')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
          >
            Back to Provider Setup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="glass-card rounded-3xl p-8">
          {status === 'instructions' && (
            <>
              <div className="text-center mb-8">
                <Key className="w-16 h-16 mx-auto mb-6 text-purple-500" />
                <h1 className="text-3xl font-bold mb-2">Auto-Capture {config.name} API Key</h1>
                <p className="text-gray-400">We'll automatically capture your API key from your authenticated session</p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-blue-300 mb-4">How it works:</h3>
                <ol className="space-y-3 text-base text-white">
                  {config.instructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-7 h-7 bg-blue-500/30 text-blue-200 rounded-full flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </span>
                      <span className="pt-0.5">{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={startCapture}
                  className="flex-1 py-4 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-5 h-5" />
                  Start Auto-Capture
                </button>

                <button
                  onClick={handleManualEntry}
                  className="py-4 px-6 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition-colors"
                >
                  Manual Entry Instead
                </button>
              </div>
            </>
          )}

          {status === 'capturing' && (
            <>
              <div className="text-center mb-8">
                <Loader2 className="w-16 h-16 mx-auto mb-6 text-purple-500 animate-spin" />
                <h1 className="text-2xl font-bold mb-4">Capturing API Key...</h1>
                <p className="text-gray-400">{message}</p>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                <p className="text-sm text-yellow-400">
                  🔒 Make sure you're signed in to your {config.name} account in the popup window
                </p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-4 text-green-400">API Key Captured!</h1>
                <p className="text-gray-300 mb-4">{message}</p>
                <p className="text-sm text-gray-500">Redirecting in {countdown} seconds...</p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-4 text-red-400">Capture Failed</h1>
                <p className="text-gray-300 mb-6">{message}</p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={startCapture}
                  className="flex-1 py-3 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleManualEntry}
                  className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Manual Entry
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KeyCapturePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    }>
      <KeyCaptureContent />
    </Suspense>
  )
}