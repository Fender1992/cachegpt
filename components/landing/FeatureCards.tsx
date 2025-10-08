'use client';

import { Zap, Shield, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'Ask Anything',
    description: 'Get instant answers, creative ideas, code help, and more. No limits on what you can ask.',
    color: 'purple',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Smart caching delivers instant responses for similar queries. Save time and money.',
    color: 'blue',
  },
  {
    icon: Shield,
    title: 'Zero Setup',
    description: 'Login with Google or GitHub and start chatting. No API keys, no credit card required.',
    color: 'green',
  },
];

export default function FeatureCards() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Everything you need to get started
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Powerful AI capabilities without the complexity. Just login and start chatting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-200 dark:border-gray-700"
              >
                <div className={`inline-flex p-4 rounded-xl ${colorClasses[feature.color as keyof typeof colorClasses]} mb-4`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
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
