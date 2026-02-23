'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { supabase } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

const PRESET_AMOUNTS = [
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$25', cents: 2500 },
  { label: '$50', cents: 5000 },
  { label: '$100', cents: 10000 },
];

export default function DonatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-950"><Navigation /></div>}>
      <DonateContent />
    </Suspense>
  );
}

function DonateContent() {
  const searchParams = useSearchParams();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(2500);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canceled, setCanceled] = useState(false);
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      setCanceled(true);
      const timer = setTimeout(() => setCanceled(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const getAmountCents = (): number => {
    if (customAmount) {
      return Math.round(parseFloat(customAmount) * 100);
    }
    return selectedAmount || 0;
  };

  const handleDonate = async () => {
    const amountCents = getAmountCents();
    if (amountCents < 100 || amountCents > 1000000) {
      setError('Please enter an amount between $1 and $10,000');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await apiFetch('/api/donate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: amountCents,
          message,
          is_anonymous: isAnonymous,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start donation');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {canceled && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-xl text-yellow-800 dark:text-yellow-200 text-sm">
            Donation canceled. No worries — you can try again anytime!
          </div>
        )}

        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
            Support CacheGPT
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg max-w-md mx-auto">
            CacheGPT is free for everyone. Your donation helps us keep it that way and build new features.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
          {/* Preset amounts */}
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Choose an amount
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
            {PRESET_AMOUNTS.map(({ label, cents }) => (
              <button
                key={cents}
                onClick={() => { setSelectedAmount(cents); setCustomAmount(''); }}
                className={`min-h-[44px] px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  selectedAmount === cents && !customAmount
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md scale-105'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Or enter a custom amount
          </label>
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">
              $
            </span>
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              placeholder="0.00"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedAmount(null);
              }}
              className="w-full pl-8 pr-4 py-3 min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Message */}
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Leave a message (optional)
          </label>
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Thanks for building CacheGPT!"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none mb-4"
          />

          {/* Anonymous checkbox */}
          <label className="flex items-center gap-3 mb-6 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Make my donation anonymous
            </span>
          </label>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Donate button */}
          <button
            onClick={handleDonate}
            disabled={loading || getAmountCents() < 100}
            className="w-full min-h-[48px] py-3 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Redirecting to Stripe...' : `Donate ${getAmountCents() >= 100 ? '$' + (getAmountCents() / 100).toFixed(2) : ''}`}
          </button>

          <p className="text-center text-xs text-gray-500 dark:text-gray-500 mt-4">
            Payments are securely processed by Stripe. CacheGPT never sees your card details.
          </p>
        </div>
      </main>
    </div>
  );
}
