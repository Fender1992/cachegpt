import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ProviderCacheProvider } from '@/lib/provider-cache-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CacheGPT - Free AI Chat with Smart Caching',
  description: 'Zero-setup AI chat with automatic caching. Login with Google/GitHub and start chatting instantly.',
  viewport: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ProviderCacheProvider>
          {children}
        </ProviderCacheProvider>
      </body>
    </html>
  )
}