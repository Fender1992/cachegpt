'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { isDesktop } from '@/lib/api-client'
import { IS_DESKTOP_BUILD } from '@/hooks/useIsDesktop'

/**
 * Hook that listens for Tauri deep link auth callbacks (cachegpt://auth?access_token=...&refresh_token=...)
 * and sets the Supabase session accordingly.
 */
export function useDesktopAuth() {
  const router = useRouter()

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
          router.push('/chat')
        }
      }
    } catch (err) {
      console.error('Failed to handle desktop auth deep link:', err)
    }
  }, [router])

  useEffect(() => {
    // Use build-time constant OR runtime check (covers both built app and dev mode)
    if (!IS_DESKTOP_BUILD && !isDesktop()) return

    // Register the deep link handler on window — Rust calls this via window.eval
    ;(window as any).__TAURI_DEEP_LINK__ = (url: string) => {
      handleDeepLink(url)
    }

    // Check if app was opened via deep link (cold start)
    const checkInitialDeepLink = async () => {
      try {
        // Try both Tauri v2 global patterns
        const tauri = (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__
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
