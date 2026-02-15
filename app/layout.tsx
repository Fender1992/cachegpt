import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ProviderCacheProvider } from '@/lib/provider-cache-context'
import SignupPromptModal from '@/components/signup-prompt-modal'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'CacheGPT - Free AI Chat | GPT-4, Claude, Gemini - Instant Responses',
  description: 'Free AI chat with GPT-4, Claude, and Gemini. 500 requests/day, no credit card required. Semantic caching delivers instant responses. Free forever.',
  keywords: [
    'free AI chat',
    'GPT-4 free',
    'Claude free',
    'Gemini free',
    'AI chat no paywall',
    'free ChatGPT alternative',
    'semantic cache',
    'AI cost optimization',
    'LLM cache',
    'vector cache'
  ],
  authors: [{ name: 'CacheGPT' }],
  creator: 'CacheGPT',
  publisher: 'CacheGPT',
  metadataBase: new URL('https://cachegpt.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cachegpt.app',
    title: 'CacheGPT - Free AI Chat | GPT-4, Claude, Gemini',
    description: 'Free AI chat with GPT-4, Claude, and Gemini. 500 requests/day, no credit card required. Semantic caching delivers instant responses. Free forever.',
    siteName: 'CacheGPT',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CacheGPT - Free AI Chat with GPT-4, Claude, and Gemini',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CacheGPT - Free AI Chat | GPT-4, Claude, Gemini',
    description: 'Free AI chat with GPT-4, Claude, and Gemini. 500 requests/day, no credit card. Free forever.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
          <SignupPromptModal />
        </ProviderCacheProvider>
      </body>
    </html>
  )
}