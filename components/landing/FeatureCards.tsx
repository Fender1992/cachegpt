'use client';

import { MessageSquare, Database, Users } from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'Ask Anything',
    description: 'Your question goes to GPT-4, Claude, or Gemini — whichever model fits best.',
    color: 'purple',
    step: '1',
  },
  {
    icon: Database,
    title: 'Smart Caching',
    description: 'Similar questions get instant cached answers — no waiting, no extra cost.',
    color: 'blue',
    step: '2',
  },
  {
    icon: Users,
    title: 'Everyone Saves',
    description: 'More users = more cache hits = faster, free responses for everyone.',
    color: 'green',
    step: '3',
  },
];

export default function FeatureCards() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            How Caching Saves You Money
          </h2>
          <p className="text-base sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Free AI chat powered by intelligent caching. Here&apos;s how it works.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            const colorClasses = {
              purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
              blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
              green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
            };

            return (
              <div
                key={feature.title}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-200 dark:border-gray-700 relative"
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
                  {feature.step}
                </div>
                <div className={`inline-flex p-4 rounded-xl ${colorClasses[feature.color as keyof typeof colorClasses]} mb-4`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
