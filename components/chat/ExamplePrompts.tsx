'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Code, BookOpen, Lightbulb } from 'lucide-react';
import { telemetry } from '@/lib/telemetry';

interface ExamplePrompt {
  icon: typeof Sparkles;
  text: string;
  category: 'writing' | 'coding' | 'learning' | 'ideas';
}

const examplePrompts: ExamplePrompt[] = [
  {
    icon: Sparkles,
    text: 'Write me a 3-day meal plan',
    category: 'writing',
  },
  {
    icon: Code,
    text: 'Help me debug this JS function',
    category: 'coding',
  },
  {
    icon: BookOpen,
    text: 'Explain today\'s top news',
    category: 'learning',
  },
  {
    icon: Lightbulb,
    text: '5 biz ideas I could start this weekend',
    category: 'ideas',
  },
];

interface ExamplePromptsProps {
  onPromptClick: (prompt: string) => void;
  layout?: 'grid' | 'list';
  className?: string;
}

export default function ExamplePrompts({
  onPromptClick,
  layout = 'grid',
  className = '',
}: ExamplePromptsProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in animation
    setIsVisible(true);
  }, []);

  const handleClick = (prompt: ExamplePrompt) => {
    telemetry.examplePromptClicked(prompt.text);
    onPromptClick(prompt.text);
  };

  const categoryColors = {
    writing: 'from-purple-500 to-purple-600',
    coding: 'from-blue-500 to-blue-600',
    learning: 'from-green-500 to-green-600',
    ideas: 'from-yellow-500 to-yellow-600',
  };

  return (
    <div
      className={`transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Try asking...
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Click any example to get started
        </p>
      </div>

      <div
        className={
          layout === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
            : 'flex flex-col gap-3'
        }
      >
        {examplePrompts.map((prompt, index) => {
          const Icon = prompt.icon;
          return (
            <button
              key={index}
              onClick={() => handleClick(prompt)}
              className={`group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-300 hover:-translate-y-1 ${
                layout === 'list' ? 'flex items-center gap-4' : ''
              }`}
            >
              <div
                className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${
                  categoryColors[prompt.category]
                } text-white ${layout === 'list' ? 'flex-shrink-0' : 'mb-3'}`}
              >
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1">
                <p className="text-gray-900 dark:text-white font-medium group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {prompt.text}
                </p>
              </div>

              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg
                  className="w-5 h-5 text-purple-600 dark:text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Or type your own question below
        </p>
      </div>
    </div>
  );
}
