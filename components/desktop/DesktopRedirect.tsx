'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isDesktopApp) return

    const isMarketingRoute = MARKETING_ROUTES.includes(pathname) ||
      pathname.startsWith('/blog/')

    if (isMarketingRoute) {
      router.replace('/chat')
    }
  }, [isDesktopApp, pathname, router])

  return null
}
