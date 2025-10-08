'use client';

import { useEffect, useState } from 'react';
import { Zap, X } from 'lucide-react';
import { telemetry } from '@/lib/telemetry';

interface CacheToastProps {
  savedCents?: number;
  onClose?: () => void;
  duration?: number;
}

export default function CacheToast({
  savedCents = 2,
  onClose,
  duration = 5000,
}: CacheToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Track toast shown
    telemetry.cacheHitShown(savedCents);

    // Animate in
    setTimeout(() => setIsVisible(true), 100);

    // Auto-dismiss
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, savedCents]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  if (!isVisible && !isExiting) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        isVisible && !isExiting
          ? 'translate-y-0 opacity-100'
          : 'translate-y-2 opacity-0'
      }`}
    >
      <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 dark:from-yellow-600 dark:to-yellow-700 text-white rounded-xl shadow-lg p-4 min-w-[280px] max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
              <Zap className="w-5 h-5 fill-current" />
            </div>
          </div>

          <div className="flex-1">
            <h4 className="font-bold text-lg mb-1">⚡ Lightning fast!</h4>
            <p className="text-sm text-yellow-50">
              You saved <span className="font-bold">{savedCents}¢</span> with
              smart caching
            </p>
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
            aria-label="Close notification"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full"
            style={{
              animation: `shrink ${duration}ms linear`,
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
