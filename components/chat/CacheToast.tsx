'use client';

import { useEffect, useState } from 'react';
import { Zap, X } from 'lucide-react';
import { telemetry } from '@/lib/telemetry';

interface CacheToastProps {
  savedCents?: number;
  responseTimeMs?: number;
  onClose?: () => void;
  duration?: number;
}

export default function CacheToast({
  savedCents = 2,
  responseTimeMs,
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

  const displayTime = responseTimeMs != null ? `${responseTimeMs}ms` : '<10ms';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        isVisible && !isExiting
          ? 'translate-y-0 opacity-100 scale-100'
          : 'translate-y-2 opacity-0 scale-95'
      }`}
    >
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 text-white rounded-xl shadow-xl shadow-green-500/25 p-4 sm:p-5 min-w-[260px] sm:min-w-[300px] max-w-[calc(100vw-2rem)] sm:max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Zap className="w-6 h-6 fill-current animate-pulse" />
            </div>
          </div>

          <div className="flex-1">
            <h4 className="font-bold text-lg mb-1">Lightning fast!</h4>
            <p className="text-sm text-green-50">
              Answered in <span className="font-bold">{displayTime}</span> — saved{' '}
              <span className="font-bold">{savedCents}c</span>
            </p>
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 text-white/80 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 -mt-2"
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
