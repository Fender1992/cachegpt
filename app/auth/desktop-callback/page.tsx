'use client'

import { useEffect, useState } from 'react'

/**
 * Client-side desktop OAuth callback page (runs on cachegpt.app).
 *
 * Supabase implicit-flow OAuth redirects here with tokens in the URL hash
 * fragment (#access_token=...&refresh_token=...). This page reads those
 * tokens and POSTs them to /api/auth/desktop-exchange keyed by the `state`
 * query param. The desktop Tauri app polls that endpoint to retrieve them.
 */
export default function DesktopCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function exchangeTokens() {
      const hash = window.location.hash.substring(1)
      const hashParams = new URLSearchParams(hash)
      const queryParams = new URLSearchParams(window.location.search)

      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const state = queryParams.get('state')

      if (!accessToken || !refreshToken) {
        setStatus('error')
        setErrorMsg('Missing tokens in OAuth response. Please try again.')
        return
      }

      if (!state) {
        setStatus('error')
        setErrorMsg('Missing state parameter. Please try again from the desktop app.')
        return
      }

      try {
        const res = await fetch('/api/auth/desktop-exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            tokens: {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: hashParams.get('expires_at'),
              expires_in: hashParams.get('expires_in'),
              token_type: hashParams.get('token_type') || 'bearer',
            },
          }),
        })

        if (!res.ok) throw new Error('Failed to store tokens')

        setStatus('success')
      } catch (err) {
        setStatus('error')
        setErrorMsg('Failed to complete sign-in. Please try again.')
      }
    }

    exchangeTokens()
  }, [])

  if (status === 'error') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ color: '#dc2626', fontWeight: 600 }}>{errorMsg}</p>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Close this window and try again from the desktop app.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 600, color: '#16a34a' }}>Sign-in successful!</p>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            You can close this browser tab and return to the CacheGPT app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <p>Completing sign-in...</p>
      </div>
    </div>
  )
}
