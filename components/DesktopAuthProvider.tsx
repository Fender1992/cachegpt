'use client'

import { useDesktopAuth } from '@/hooks/useDesktopAuth'

/**
 * Client component that activates desktop deep link auth handling.
 * No-op on web — only activates when running inside Tauri.
 */
export function DesktopAuthProvider() {
  useDesktopAuth()
  return null
}
