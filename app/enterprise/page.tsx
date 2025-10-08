import type { Metadata } from 'next';
import ClassicLanding from '../classic-landing';

/**
 * SEO Metadata for enterprise/developer page
 */
export const metadata: Metadata = {
  title: 'CacheGPT for Developers & Enterprise | LLM Caching Infrastructure',
  description: 'Production-ready LLM caching with 99.9% uptime, SOC2 compliance, and enterprise security. CLI, API, and BYOK support. Save 80% on OpenAI, Claude, Gemini costs.',
  keywords: ['LLM cache', 'AI infrastructure', 'enterprise AI', 'API caching', 'developer tools', 'CLI', 'BYOK'],
  openGraph: {
    title: 'CacheGPT for Developers & Enterprise',
    description: 'Production-ready LLM caching infrastructure. 99.9% uptime, SOC2 compliant, enterprise security.',
    url: 'https://cachegpt.app/enterprise',
  },
  twitter: {
    title: 'CacheGPT for Developers & Enterprise',
    description: 'Production-ready LLM caching infrastructure. 99.9% uptime, SOC2 compliant, enterprise security.',
  },
  alternates: {
    canonical: 'https://cachegpt.app/enterprise',
  },
};

/**
 * Enterprise/Developer landing page
 * Shows the full-featured classic landing with technical details
 */
export default function EnterprisePage() {
  return <ClassicLanding />;
}
