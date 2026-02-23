'use client'

import { useEffect } from 'react'
import { useIsDesktop } from '@/hooks/useIsDesktop'

/** Marketing routes that should redirect to /chat on desktop */
const MARKETING_ROUTES = [
  '/',
  '/pricing',
  '/blog',
  '/about',
  '/download',
  '/enterprise',
  '/donate',
  '/terms',
  '/privacy',
  '/security',
  '/changelog',
]

export default function DesktopRedirect() {
  const isDesktopApp = useIsDesktop()

  useEffect(() => {
    if (!isDesktopApp) return

    const pathname = window.location.pathname

    const isMarketingRoute = MARKETING_ROUTES.includes(pathname) ||
      pathname.startsWith('/blog/')

    if (isMarketingRoute) {
      window.location.replace('/chat')
    }
  }, [isDesktopApp])

  return null
}
