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
  if (!cached) return null;

  if (variant === 'standalone') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-800/20 border border-yellow-300 dark:border-yellow-700 rounded-full ${className}`}
      >
        <Zap className="w-4 h-4 text-yellow-600 dark:text-yellow-400 fill-current" />
        <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          Instant from cache
        </span>
        {savedCents > 0 && (
          <span className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-200 dark:bg-yellow-800/40 px-2 py-0.5 rounded-full">
            Saved {savedCents}¢
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-md ${className}`}
      title={savedCents > 0 ? `Saved ${savedCents}¢` : 'Delivered from cache'}
    >
      <Zap className="w-3 h-3 text-yellow-600 dark:text-yellow-400 fill-current" />
      <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
        from cache
      </span>
    </div>
  );
}
