'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { telemetry } from '@/lib/telemetry';
import { Loader2, ArrowRight } from 'lucide-react';

interface Mode {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  system_prompt: string;
  example_prompts: string[];
}

export default function ModesPage() {
  const [modes, setModes] = useState<Mode[]>([]);
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
        throw new Error('Failed to fetch modes');
      }
      const data = await response.json();
      setModes(data.modes || []);
    } catch (err) {
      console.error('[MODES] Error fetching modes:', err);
      setError('Failed to load modes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeClick = (mode: Mode) => {
    telemetry.modeSelected(mode.slug);
    router.push(`/chat?mode=${mode.slug}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading modes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  return (
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

        {/* Modes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleModeClick(mode)}
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
  );
}
