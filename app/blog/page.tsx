import type { Metadata } from 'next';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Blog - CacheGPT',
  description: 'News, tips, and insights about CacheGPT and AI',
};

export default function BlogPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Blog
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
          News, tips, and insights about AI
        </p>

        {/* Featured Post */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <div className="text-sm text-purple-600 dark:text-purple-400 font-semibold mb-2">
            FEATURED
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Introducing CacheGPT: Free AI Chat for Everyone
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            October 6, 2025
          </p>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Today we're excited to launch CacheGPT, a new way to chat with AI that's completely
            free and requires no setup. Learn how smart caching makes this possible and why
            we believe AI should be accessible to everyone.
          </p>
          <div className="text-purple-600 dark:text-purple-400 font-semibold">
            Coming soon →
          </div>
        </div>

        {/* More posts coming soon */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
          <p className="text-blue-800 dark:text-blue-200 mb-4">
            📝 More blog posts coming soon! Follow us for updates.
          </p>
          <div className="flex items-center justify-center gap-6">
            <a
              href="https://twitter.com/cachegpt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Twitter
            </a>
            <a
              href="https://github.com/Fender1992/cachegpt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
