import type { Metadata } from 'next';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Documentation - CacheGPT',
  description: 'Learn how to use CacheGPT and integrate it into your workflow',
};

export default function DocsPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Documentation
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
          Learn how to use CacheGPT effectively
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Getting Started
          </h2>
          <ul className="space-y-4 text-gray-700 dark:text-gray-300">
            <li>
              <Link href="/chat" className="text-purple-600 hover:underline">
                Start chatting with AI
              </Link> - No setup required
            </li>
            <li>
              <Link href="/modes" className="text-purple-600 hover:underline">
                Explore use cases
              </Link> - Pre-built AI assistants for common tasks
            </li>
            <li>
              <Link href="/docs/api" className="text-purple-600 hover:underline">
                API Reference
              </Link> - Integrate CacheGPT into your apps
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <p className="text-blue-800 dark:text-blue-200">
            📚 Full documentation coming soon! For now, feel free to explore the app or{' '}
            <Link href="/support" className="underline font-semibold">
              contact support
            </Link>{' '}
            with any questions.
          </p>
        </div>
      </div>
      </div>
    </>
  );
}
