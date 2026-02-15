import type { Metadata } from 'next';
import LandingWrapper from './landing-wrapper';
import ClassicLanding from './classic-landing';

/**
 * SEO Metadata for landing page
 */
export const metadata: Metadata = {
  title: 'CacheGPT - Free AI Chat | GPT-4, Claude, Gemini - Instant Responses',
  description: 'Free AI chat with GPT-4, Claude, and Gemini. 500 requests/day, no credit card required. Semantic caching delivers instant responses. Free forever.',
  keywords: ['free AI chat', 'GPT-4 free', 'Claude free', 'Gemini free', 'AI chat no paywall', 'semantic caching', 'free ChatGPT alternative', 'AI cost reduction'],
  authors: [{ name: 'CacheGPT Team' }],
  creator: 'CacheGPT',
  publisher: 'CacheGPT',
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
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cachegpt.app',
    siteName: 'CacheGPT',
    title: 'CacheGPT - Free AI Chat | GPT-4, Claude, Gemini',
    description: 'Free AI chat with GPT-4, Claude, and Gemini. 500 requests/day, no credit card required. Semantic caching delivers instant responses. Free forever.',
    images: [
      {
        url: 'https://cachegpt.app/og-image.png',
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
  alternates: {
    canonical: 'https://cachegpt.app',
  },
  category: 'technology',
};

/**
 * Main landing page that conditionally renders casual or classic version
 * based on feature flag: ui_casual_landing
 */
export default function Page() {
  return <LandingWrapper ClassicLanding={ClassicLanding} />;
}
