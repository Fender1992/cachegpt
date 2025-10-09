import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ProviderCacheProvider } from '@/lib/provider-cache-context'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'CacheGPT - Reduce LLM API Costs by 80% | Smart Caching for AI',
  description: 'Cut your AI API costs by 80% and speed up responses to <10ms with intelligent caching. Works with OpenAI, Anthropic, Google Gemini, and all major LLM providers. Free to start.',
  keywords: [
    'AI caching',
    'LLM cache',
    'OpenAI cache',
    'reduce AI costs',
    'ChatGPT cache',
    'Claude cache',
    'GPT-4 cost reduction',
    'AI cost optimization',
    'semantic cache',
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
    title: 'CacheGPT - Reduce LLM API Costs by 80%',
    description: 'Intelligent caching for AI APIs. Cut costs by 80% and speed up responses to <10ms. Works with OpenAI, Anthropic, Google, and all major LLM providers.',
    siteName: 'CacheGPT',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CacheGPT - Smart Caching for AI APIs',
      },
    ],
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
        </ProviderCacheProvider>
      </body>
    </html>
  )
}