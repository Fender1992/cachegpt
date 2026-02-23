'use client'

import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import { isDesktop } from '@/lib/api-client'

/**
 * Hook that listens for Tauri deep link auth callbacks (cachegpt://auth?access_token=...&refresh_token=...)
 * and sets the Supabase session accordingly.
 */
export function useDesktopAuth() {
  const handleDeepLink = useCallback(async (url: string) => {
    try {
      const parsed = new URL(url)
      const accessToken = parsed.searchParams.get('access_token')
      const refreshToken = parsed.searchParams.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          console.error('Desktop auth session error:', error)
        } else {
          // Redirect to chat after successful auth
          window.location.href = '/chat'
        }
      }
    } catch (err) {
      console.error('Failed to handle desktop auth deep link:', err)
    }
  }, [])

  useEffect(() => {
    if (!isDesktop()) return

    // Register the deep link handler on window
    ;(window as any).__TAURI_DEEP_LINK__ = (url: string) => {
      handleDeepLink(url)
    }

    // Check if app was opened via deep link (cold start)
    const checkInitialDeepLink = async () => {
      try {
        // Dynamic import via window.__TAURI__ to avoid build-time module resolution
        const tauri = (window as any).__TAURI__
        if (tauri?.deepLink?.getCurrent) {
          const urls = await tauri.deepLink.getCurrent()
          if (urls && urls.length > 0) {
            handleDeepLink(urls[0])
          }
        }
      } catch {
        // Deep link plugin not available or no initial URL
      }
    }

    checkInitialDeepLink()

    return () => {
      delete (window as any).__TAURI_DEEP_LINK__
    }
  }, [handleDeepLink])
}
