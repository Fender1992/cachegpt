'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';

export default function DonateSuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />

      {/* CSS confetti */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              backgroundColor: ['#a855f7', '#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'][i % 6],
              width: `${6 + Math.random() * 8}px`,
              height: `${6 + Math.random() * 8}px`,
            }}
          />
        ))}
      </div>

      <main className="relative max-w-lg mx-auto px-4 py-20 sm:py-32 text-center">
        <div className="text-6xl sm:text-7xl mb-6 animate-bounce">
          &#10084;
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
          Thank You!
        </h1>

        <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg mb-8">
          Your donation helps keep CacheGPT free for everyone!
        </p>

        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
          Redirecting to dashboard in {countdown} second{countdown !== 1 ? 's' : ''}...
        </p>

        <button
          onClick={() => router.push('/dashboard')}
          className="min-h-[48px] w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
        >
          Go to Dashboard
        </button>
      </main>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .confetti-piece {
          position: absolute;
          top: -20px;
          border-radius: 2px;
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
}
