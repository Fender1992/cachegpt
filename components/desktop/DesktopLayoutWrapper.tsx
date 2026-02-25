'use client'

import { type ReactNode } from 'react'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { DesktopNavigationProvider } from './DesktopNavigationContext'
import DesktopSidebar from './DesktopSidebar'

interface DesktopLayoutWrapperProps {
  children: ReactNode
}

export default function DesktopLayoutWrapper({ children }: DesktopLayoutWrapperProps) {
  const isDesktopApp = useIsDesktop()

  if (!isDesktopApp) {
    return <>{children}</>
  }

  return (
    <DesktopNavigationProvider>
      <div className="flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </DesktopNavigationProvider>
  )
}
