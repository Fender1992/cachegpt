import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog - CacheGPT',
  description: 'Latest updates and improvements to CacheGPT',
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Changelog
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
          See what's new in CacheGPT
        </p>

        {/* October 2025 */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              October 2025
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎨 New Casual UI
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Redesigned landing page and chat interface for a more user-friendly experience.
                Now easier than ever to get started!
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎯 AI Modes
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Pre-built AI assistants for common tasks: Code Helper, Creative Writer, Study Buddy, and more.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🎨 Theme System
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Choose from 4 beautiful themes: Light, Dark, Solarized, and Neon. Customize your experience!
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                📊 Dashboard
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                Track your chat activity, cache hits, and unlock achievements as you use CacheGPT.
              </p>
            </div>
          </div>
        </div>

        {/* September 2025 */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              September 2025
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                🚀 Initial Launch
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                CacheGPT goes live with LLM caching, multiple AI providers, and CLI support.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
          <p className="text-purple-800 dark:text-purple-200">
            💡 Have a feature request? Let us know through our{' '}
            <a href="/support" className="underline font-semibold">
              support page
            </a>!
          </p>
        </div>
      </div>
    </div>
  );
}
