'use client'

import { useEffect, useState } from 'react'

/**
 * Client-side desktop OAuth callback page.
 *
 * Supabase implicit-flow OAuth redirects here with tokens in the URL hash
 * fragment (e.g. #access_token=...&refresh_token=...).  Hash fragments are
 * never sent to the server, so a server-side API route cannot read them.
 *
 * This page reads the fragment, builds a cachegpt:// deep link with the
 * tokens, and redirects the system browser to it so the Tauri app can
 * capture the session.
 */
export default function DesktopCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const hash = window.location.hash.substring(1) // strip leading #
    const params = new URLSearchParams(hash)

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setError('Missing tokens in OAuth response. Please try signing in again.')
      return
    }

    // Build deep link and redirect
    const deepLink = `cachegpt://auth?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
    window.location.href = deepLink
  }, [])

  if (error) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Close this window and try again from the desktop app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <p>Signing you in...</p>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          If the app doesn&apos;t open automatically, you can close this window.
        </p>
      </div>
    </div>
  )
}
