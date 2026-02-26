'use client'

import { useState, useRef, useCallback } from 'react'
import { isDesktop } from '@/lib/api-client'

const PRODUCTION_URL = 'https://cachegpt.app'
const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 5 * 60 * 1000

export interface DesktopOAuthResult {
  success: boolean
  provider: string
  error?: string
}

/**
 * Encode the desktop OAuth state param.
 * Contains: s = polling state UUID, u = userId, d = desktop flag.
 * Base64-encoded so OAuth providers pass it through as an opaque string.
 */
function encodeDesktopState(pollingState: string, userId: string): string {
  return btoa(JSON.stringify({ s: pollingState, u: userId, d: true }))
}

/**
 * Shared hook for desktop integration OAuth.
 * Opens the system browser, polls the exchange endpoint, and returns the result.
 */
export function useDesktopIntegrationOAuth() {
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setConnecting(false)
  }, [])

  /**
   * Start the desktop OAuth flow.
   * @param oauthUrl - The full OAuth authorization URL (with redirect_uri pointing to production)
   * @param userId - Current user's ID
   * @param provider - Integration provider name (e.g. 'slack')
   * @param onSuccess - Called when the integration completes successfully
   * @param onError - Called on error or timeout
   * @param stateParamName - The query param name for state in the OAuth URL (default: 'state')
   */
  const startOAuth = useCallback(async (
    oauthUrl: string,
    userId: string,
    provider: string,
    onSuccess: (result: DesktopOAuthResult) => void,
    onError: (error: string) => void,
    stateParamName: string = 'state',
  ) => {
    if (!isDesktop()) return

    const pollingState = crypto.randomUUID()
    const encodedState = encodeDesktopState(pollingState, userId)

    // Append encoded state to the OAuth URL
    const url = new URL(oauthUrl)
    url.searchParams.set(stateParamName, encodedState)

    setConnecting(true)

    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url.toString())
    } catch {
      cleanup()
      onError('Failed to open browser. Please try again.')
      return
    }

    // Poll for result
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${PRODUCTION_URL}/api/auth/desktop-exchange?state=${pollingState}`
        )
        const data = await res.json()
        if (data.tokens) {
          cleanup()
          const result = data.tokens as DesktopOAuthResult
          if (result.success) {
            onSuccess(result)
          } else {
            onError(result.error || `${provider} connection failed.`)
          }
        } else if (data.error) {
          cleanup()
          onError(data.error)
        }
        // else: data.pending — keep polling
      } catch {
        // Network error, keep polling
      }
    }, POLL_INTERVAL_MS)

    // Timeout after 5 minutes
    timeoutRef.current = setTimeout(() => {
      cleanup()
      onError('Connection timed out. Please try again.')
    }, TIMEOUT_MS)
  }, [cleanup])

  return { startOAuth, connecting, cleanup }
}
