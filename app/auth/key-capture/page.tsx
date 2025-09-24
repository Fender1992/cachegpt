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

    // Generate capture URL through our intermediate page
    const captureUrl = `/auth/provider-capture?provider=${provider}&session=${sessionId}&target=${encodeURIComponent(config.keyPageUrl)}`

    // Open our capture page in a new window
    const captureWindow = window.open(captureUrl, 'key_capture', 'width=900,height=700,scrollbars=yes,resizable=yes')

    if (!captureWindow) {
      setStatus('error')
      setMessage('Please allow popups and try again')
      return
    }

    // Poll for capture results with exponential backoff
    let attempts = 0
    let consecutiveFailures = 0
    let pollTimeout: NodeJS.Timeout

    const maxAttempts = 40 // Reduced from 120 since we're polling less frequently
    const baseInterval = 2000 // Start with 2 second intervals

    const pollForResult = async (): Promise<void> => {
      attempts++

      try {
        const response = await fetch(`/api/auth/capture-key?session=${sessionId}`)

        // Handle rate limiting
        if (response.status === 429) {
          consecutiveFailures++
          const backoffDelay = Math.min(8000, baseInterval * Math.pow(2, consecutiveFailures)) // Max 8s backoff
          console.log(`Rate limited, backing off for ${backoffDelay}ms`)

          if (attempts >= maxAttempts) {
            captureWindow.close()
            setStatus('error')
            setMessage('Request rate limited. Please wait a moment and try again.')
            return
          }

          // Schedule next poll with backoff
          pollTimeout = setTimeout(pollForResult, backoffDelay)
          return
        }

        const result = await response.json()
        consecutiveFailures = 0 // Reset on successful response

        if (result.waiting) {
          // Still waiting
          if (attempts >= maxAttempts) {
            captureWindow.close()
            setStatus('error')
            setMessage('Capture timeout. Please try again or use manual API key entry.')
            return
          }

          // Schedule next poll with normal interval
          pollTimeout = setTimeout(pollForResult, baseInterval)
          return
        }

        // Got a result
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
        consecutiveFailures++
        if (attempts >= maxAttempts) {
          captureWindow.close()
          setStatus('error')
          setMessage('Network error during capture')
        } else {
          // Schedule retry with backoff
          const backoffDelay = Math.min(5000, baseInterval + (consecutiveFailures * 1000))
          pollTimeout = setTimeout(pollForResult, backoffDelay)
        }
      }
    }

    // Start polling
    pollTimeout = setTimeout(pollForResult, baseInterval)

    // Update status message
    setMessage(`Please sign in to your ${config.name} account in the popup window...`)
  }

  const handleManualEntry = () => {
    router.push(`/auth/provider-setup?provider=${provider}&source=cli&step=manual`)
  }

  if (!provider || !config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Invalid Request</h1>
          <p className="text-gray-600 mb-6">Missing or invalid provider information.</p>
          <button
            onClick={() => router.push('/auth/provider-setup?source=cli')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            Back to Provider Setup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8">
          {status === 'instructions' && (
            <>
              <div className="text-center mb-8">
                <Key className="w-16 h-16 mx-auto mb-6 text-blue-600" />
                <h1 className="text-3xl font-bold mb-2 text-gray-900">Auto-Capture {config.name} API Key</h1>
                <p className="text-gray-600">We'll automatically capture your API key from your authenticated session</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
                <h3 className="font-semibold text-blue-700 mb-4">How it works:</h3>
                <ol className="space-y-3 text-base text-gray-700">
                  {config.instructions.map((instruction, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
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
                  className="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <ExternalLink className="w-5 h-5" />
                  Start Auto-Capture
                </button>

                <button
                  onClick={handleManualEntry}
                  className="py-4 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
                >
                  Manual Entry Instead
                </button>
              </div>
            </>
          )}

          {status === 'capturing' && (
            <>
              <div className="text-center mb-8">
                <Loader2 className="w-16 h-16 mx-auto mb-6 text-blue-600 animate-spin" />
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Capturing API Key...</h1>
                <p className="text-gray-600">{message}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-sm text-amber-700">
                  🔒 Make sure you're signed in to your {config.name} account in the popup window
                </p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 bg-green-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-4 text-gray-900">API Key Captured!</h1>
                <p className="text-gray-700 mb-4">{message}</p>
                <p className="text-sm text-gray-500">Redirecting in {countdown} seconds...</p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 bg-red-600 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold mb-4 text-gray-900">Capture Failed</h1>
                <p className="text-gray-700 mb-6">{message}</p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={startCapture}
                  className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  Try Again
                </button>
                <button
                  onClick={handleManualEntry}
                  className="flex-1 py-3 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    }>
      <KeyCaptureContent />
    </Suspense>
  )
}