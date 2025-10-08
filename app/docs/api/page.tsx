import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API Reference - CacheGPT',
  description: 'API documentation for integrating CacheGPT into your applications',
};

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          API Reference
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
          Integrate CacheGPT's LLM caching into your applications
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Quick Start
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            CacheGPT provides a REST API compatible with OpenAI's format, making it easy to drop in as a replacement.
          </p>

          <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm mb-4">
            <code>
              npm install cachegpt-cli<br />
              cachegpt login<br />
              cachegpt chat "Hello, world!"
            </code>
          </div>

          <p className="text-gray-700 dark:text-gray-300">
            Check out the{' '}
            <a
              href="https://www.npmjs.com/package/cachegpt-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:underline"
            >
              CLI on npm
            </a>{' '}
            for more details.
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <p className="text-blue-800 dark:text-blue-200">
            📖 Detailed API documentation coming soon! For now, see the{' '}
            <Link href="/enterprise" className="underline font-semibold">
              developer page
            </Link>{' '}
            or{' '}
            <Link href="/support" className="underline font-semibold">
              contact us
            </Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
