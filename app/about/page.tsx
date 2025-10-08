import type { Metadata } from 'next';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'About - CacheGPT',
  description: 'Learn more about CacheGPT and our mission',
};

export default function AboutPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          About CacheGPT
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
          Making AI accessible to everyone
        </p>

        {/* Mission */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Our Mission
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            CacheGPT was built to make AI chat accessible to everyone - without the complexity
            of API keys, rate limits, or confusing pricing.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            By using intelligent caching, we can reduce costs by up to 80% and pass those
            savings directly to users. That means free AI chat for everyone, powered by
            the best models from OpenAI, Anthropic, Google, and more.
          </p>
        </div>

        {/* How It Works */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            How It Works
          </h2>
          <ul className="space-y-4 text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <strong className="text-gray-900 dark:text-white">Smart Caching:</strong>
                {' '}We cache similar prompts and responses, reducing redundant API calls
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <strong className="text-gray-900 dark:text-white">Multiple Providers:</strong>
                {' '}Access OpenAI, Claude, Gemini, and Perplexity - all in one place
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <strong className="text-gray-900 dark:text-white">Privacy First:</strong>
                {' '}Your data is encrypted, never sold, and never used to train AI models
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">💰</span>
              <div>
                <strong className="text-gray-900 dark:text-white">Save Money:</strong>
                {' '}Up to 80% cost reduction compared to direct API usage
              </div>
            </li>
          </ul>
        </div>

        {/* For Developers */}
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl p-8 border-2 border-purple-200 dark:border-purple-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            For Developers
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            CacheGPT also provides a CLI and API for integrating LLM caching into your applications.
            Perfect for production apps that need reliable, cost-effective AI.
          </p>
          <Link
            href="/enterprise"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Learn more →
          </Link>
        </div>
      </div>
      </div>
    </>
  );
}
