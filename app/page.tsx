import type { Metadata } from 'next';
import LandingWrapper from './landing-wrapper';
import ClassicLanding from './classic-landing';

/**
 * SEO Metadata for landing page
 */
export const metadata: Metadata = {
  title: 'CacheGPT - Your AI, Instantly | Save 80% on LLM Costs',
  description: 'Chat with AI for free. CacheGPT cuts API costs by 80% and speeds up responses to <10ms with smart caching. No credit card required. Start chatting now!',
  keywords: ['AI chat', 'LLM caching', 'OpenAI', 'Claude', 'Gemini', 'Perplexity', 'API cost reduction', 'fast AI responses'],
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
    title: 'CacheGPT - Your AI, Instantly',
    description: 'Chat with AI for free. Save 80% on costs with smart caching. No credit card required.',
    images: [
      {
        url: 'https://cachegpt.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CacheGPT - Your AI, Instantly',
      },
    ],
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
