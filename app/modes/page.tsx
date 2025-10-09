'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { telemetry } from '@/lib/telemetry';
import { Loader2, ArrowRight } from 'lucide-react';
import Navigation from '@/components/Navigation';

interface Mode {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  system_prompt: string;
  example_prompts: string[];
}

interface TrendingMode {
  slug: string;
  title: string;
  description: string;
  icon: string;
  click_count: number;
  last_clicked: string;
}

export default function ModesPage() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [trending, setTrending] = useState<TrendingMode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    telemetry.modesView();
    fetchModes();
  }, []);

  const fetchModes = async () => {
    try {
      const response = await fetch('/api/modes');
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('This feature is not available yet');
        }
        throw new Error('Failed to fetch modes');
      }
      const data = await response.json();
      setModes(data.modes || []);
      setTrending(data.trending || []);
    } catch (err: any) {
      console.error('[MODES] Error fetching modes:', err);
      setError(err.message || 'Failed to load modes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeClick = async (modeSlug: string, source: string) => {
    // Record click for trending
    try {
      await fetch('/api/modes/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modeSlug, source }),
      });
    } catch (err) {
      console.error('[MODES] Error recording click:', err);
    }

    telemetry.modeSelected(modeSlug);
    router.push(`/chat?mode=${modeSlug}`);
  };

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading modes...</p>
        </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchModes}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Mode
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Select a specialized AI assistant optimized for your task
          </p>
        </div>

        {/* Trending Section */}
        {trending.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                🔥 Trending Now
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Most popular this week
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trending.map((mode, idx) => (
                <button
                  key={mode.slug}
                  onClick={() => handleModeClick(mode.slug, 'gallery')}
                  className="group relative bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-2 border-purple-200 dark:border-purple-700 rounded-2xl p-6 text-left hover:shadow-xl hover:border-purple-400 dark:hover:border-purple-500 transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Trending Badge */}
                  <div className="absolute top-4 right-4 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                    #{idx + 1}
                  </div>

                  {/* Icon */}
                  <div className="text-5xl mb-4">{mode.icon}</div>

                  {/* Title */}
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                    {mode.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    {mode.description}
                  </p>

                  {/* Stats */}
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {mode.click_count} {mode.click_count === 1 ? 'use' : 'uses'} this week
                  </div>

                  {/* Arrow Icon */}
                  <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All Modes Section */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            All Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeClick(mode.slug, 'gallery')}
                className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 text-left hover:shadow-xl hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-300 hover:-translate-y-1"
              >
                {/* Icon */}
                <div className="text-5xl mb-4">{mode.icon}</div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {mode.title}
                </h3>

                {/* Description */}
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {mode.description}
                </p>

                {/* Example Prompts */}
                <div className="space-y-2 mb-4">
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Examples:
                  </p>
                  {mode.example_prompts.slice(0, 2).map((example, idx) => (
                    <p
                      key={idx}
                      className="text-sm text-gray-600 dark:text-gray-400 pl-3 border-l-2 border-gray-200 dark:border-gray-700"
                    >
                      {example}
                    </p>
                  ))}
                </div>

                {/* Arrow Icon */}
                <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Or start a regular chat without a mode
          </p>
          <button
            onClick={() => router.push('/chat')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
          >
            Go to Chat
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
