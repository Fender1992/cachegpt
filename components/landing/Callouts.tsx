'use client';

import Link from 'next/link';
import { Terminal, Code2, Palette } from 'lucide-react';

const callouts = [
  {
    icon: Terminal,
    title: 'CLI for Developers',
    description: 'Install our CLI tool and chat with AI directly from your terminal. Perfect for coding workflows.',
    cta: 'Try the CLI',
    href: 'https://www.npmjs.com/package/cachegpt-cli',
    external: true,
  },
  {
    icon: Code2,
    title: 'API Access',
    description: 'Integrate CacheGPT into your applications with our simple REST API. Cache-first by default.',
    cta: 'View on GitHub',
    href: 'https://github.com/Fender1992/cachegpt',
    external: true,
  },
  {
    icon: Palette,
    title: 'Use Your Own Keys',
    description: 'Bring your own API keys for ChatGPT, Claude, or Gemini. Full control over your AI usage.',
    cta: 'Learn more',
    href: '/settings?tab=providers',
    external: false,
  },
];

export default function Callouts() {
  return (
    <div className="bg-white dark:bg-gray-800 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Built for power users too
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Simple for beginners, powerful for developers
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {callouts.map((callout) => {
            const Icon = callout.icon;
            return (
              <div
                key={callout.title}
                className="group relative bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:border-purple-600 dark:hover:border-purple-400 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {callout.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                      {callout.description}
                    </p>
                    {callout.external ? (
                      <a
                        href={callout.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                      >
                        {callout.cta}
                        <svg className="ml-1 w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </a>
                    ) : (
                      <Link
                        href={callout.href}
                        className="inline-flex items-center text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                      >
                        {callout.cta}
                        <svg className="ml-1 w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
