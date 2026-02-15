'use client';

import { Zap } from 'lucide-react';

interface CacheBadgeProps {
  cached?: boolean;
  savedCents?: number;
  className?: string;
  variant?: 'inline' | 'standalone';
}

export default function CacheBadge({
  cached = false,
  savedCents = 0,
  className = '',
  variant = 'inline',
}: CacheBadgeProps) {
  if (variant === 'standalone') {
    if (cached) {
      return (
        <div
          className={`inline-flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-emerald-800/30 border border-green-400 dark:border-green-600 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.3)] dark:shadow-[0_0_12px_rgba(34,197,94,0.2)] ${className}`}
        >
          <div className="relative">
            <Zap className="w-5 h-5 text-green-600 dark:text-green-400 fill-current animate-pulse" />
            <div className="absolute inset-0 w-5 h-5 bg-green-400/30 rounded-full animate-ping" />
          </div>
          <span className="text-base font-semibold text-green-800 dark:text-green-200">
            Instant from cache
          </span>
          {savedCents > 0 && (
            <span className="text-sm font-medium text-green-700 dark:text-green-300 bg-green-200 dark:bg-green-800/50 px-2.5 py-0.5 rounded-full">
              Saved {savedCents}c
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-600 rounded-full opacity-70 ${className}`}
      >
        <Zap className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Cache miss
        </span>
      </div>
    );
  }

  // Inline variant
  if (!cached) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-md ${className}`}
      title={savedCents > 0 ? `Saved ${savedCents}c` : 'Delivered from cache'}
    >
      <Zap className="w-3 h-3 text-green-600 dark:text-green-400 fill-current" />
      <span className="text-xs font-medium text-green-800 dark:text-green-200">
        from cache
      </span>
    </div>
  );
}
