'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Code, BookOpen, Lightbulb, ArrowRight, MessageSquare } from 'lucide-react';
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
  mode?: {
    slug: string;
    title: string;
    example_prompts: string[];
  } | null;
  lastConversationTitle?: string | null;
  onContinueConversation?: () => void;
  hasConversations?: boolean;
}

export default function ExamplePrompts({
  onPromptClick,
  layout = 'grid',
  className = '',
  mode = null,
  lastConversationTitle = null,
  onContinueConversation,
  hasConversations = false,
}: ExamplePromptsProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in animation
    setIsVisible(true);
  }, []);

  const handleClick = async (promptText: string, prompt?: ExamplePrompt) => {
    telemetry.examplePromptClicked(promptText);

    // Record click for mode if applicable
    if (mode) {
      try {
        await fetch('/api/modes/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modeSlug: mode.slug, source: 'empty_state' }),
        });
      } catch (err) {
        console.error('[EXAMPLE-PROMPTS] Error recording click:', err);
      }
    }

    onPromptClick(promptText);
  };

  const categoryColors = {
    writing: 'from-purple-500 to-purple-600',
    coding: 'from-blue-500 to-blue-600',
    learning: 'from-green-500 to-green-600',
    ideas: 'from-yellow-500 to-yellow-600',
  };

  // Use mode-specific examples if available, otherwise default examples
  const displayPrompts = mode?.example_prompts
    ? mode.example_prompts.slice(0, 4).map(text => ({ text, category: 'writing' as const, icon: Sparkles }))
    : examplePrompts.map(p => ({ text: p.text, category: p.category, icon: p.icon }));

  return (
    <div
      className={`transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {mode ? `Try ${mode.title}...` : hasConversations ? 'Welcome back' : 'Try asking...'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {hasConversations ? 'Start a new conversation or pick up where you left off' : 'Click any example to get started'}
        </p>
      </div>

      {/* Continue last conversation (returning users) */}
      {lastConversationTitle && onContinueConversation && (
        <button
          onClick={onContinueConversation}
          className="w-full mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
              <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-0.5">Continue where you left off</div>
              <div className="text-sm text-gray-900 dark:text-white truncate">{lastConversationTitle}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform flex-shrink-0" />
          </div>
        </button>
      )}

      <div
        className={
          layout === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
            : 'flex flex-col gap-3'
        }
      >
        {displayPrompts.map((prompt, index) => {
          const Icon = prompt.icon;
          const category = prompt.category;
          return (
            <button
              key={index}
              onClick={() => handleClick(prompt.text)}
              className={`group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-300 hover:-translate-y-1 ${
                layout === 'list' ? 'flex items-center gap-4' : ''
              }`}
            >
              <div
                className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${
                  categoryColors[category]
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

      {/* Feature discovery row */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium">
          <kbd className="text-[10px] font-semibold text-gray-400">&#x2318;K</kbd> Quick actions
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium">
          Or type your own question below
        </span>
      </div>
    </div>
  );
}
