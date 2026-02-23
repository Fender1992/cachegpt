'use client'

import { useState, useEffect } from 'react'
import { isDesktop } from '@/lib/api-client'

/**
 * Build-time constant — true during desktop static export (next.config.desktop.js sets
 * NEXT_PUBLIC_IS_DESKTOP='true'). This is inlined at build time so the static HTML
 * already contains the desktop layout — no flash of web UI.
 */
export const IS_DESKTOP_BUILD = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true'

/**
 * React hook that returns true when running inside the Tauri desktop app.
 * Uses the build-time constant as initial state so the desktop build pre-renders
 * the correct layout in static HTML. Falls back to runtime window.__TAURI__ check.
 */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(IS_DESKTOP_BUILD)

  useEffect(() => {
    // Runtime confirmation — handles dev mode where build-time var may not be set
    setDesktop(IS_DESKTOP_BUILD || isDesktop())
  }, [])

  return desktop
}
