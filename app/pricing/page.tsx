'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Check, Heart } from 'lucide-react';
import Toast from '@/components/toast';
import Navigation from '@/components/Navigation';

const FEATURES = [
  '500 requests/day (15,000/month)',
  'Multi-provider AI chat (OpenAI, Claude, Gemini)',
  'Semantic caching for instant responses',
  'File uploads',
  'Web dashboard & CLI',
  'All integrations included',
  'Usage analytics',
  'Conversation sharing',
];

const DONATION_AMOUNTS = [5, 10, 25, 50, 100];

export default function PricingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        // silently handle user data loading failure
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, [supabase]);

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">

      {/* Hero Section */}
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Free Forever
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8">
          Full-featured AI chat with semantic caching. No credit card required. No hidden fees. Ever.
        </p>
      </div>

      <div className="container mx-auto px-4 sm:px-6 pb-24">
        {/* Free Forever Hero Card */}
        <div className="max-w-2xl mx-auto mb-16">
          <div className="relative rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-2xl">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-green-400 text-green-900 text-sm font-bold rounded-full">
              FREE FOREVER
            </div>

            <div className="mb-6 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl sm:text-6xl font-bold">$0</span>
                <span className="text-lg text-purple-100">/forever</span>
              </div>
              <p className="text-purple-100 mt-2">Everything included. No tiers. No limits on features.</p>
            </div>

            <div className="mb-8 pb-6 border-b border-purple-400">
              <p className="text-purple-100 text-center text-sm">
                500 requests/day &middot; 15,000 requests/month
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {FEATURES.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-purple-200" />
                  <span className="text-sm text-purple-50">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => {
                if (!user) {
                  router.push('/login?redirect=/chat');
                } else {
                  router.push('/chat');
                }
              }}
              className="w-full py-3 px-6 rounded-lg font-semibold transition-all bg-white text-purple-600 hover:bg-purple-50 min-h-[44px]"
            >
              {loading ? 'Loading...' : user ? 'Start Chatting' : 'Get Started Free'}
            </button>
          </div>
        </div>

        {/* Donation Section */}
        <div className="max-w-2xl mx-auto mb-16">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Heart className="w-6 h-6 text-pink-500" />
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Support CacheGPT</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-300 max-w-lg mx-auto">
              Love CacheGPT? Help keep it free for everyone. Your donations cover server costs and development.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 border-2 border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
              {DONATION_AMOUNTS.map((amount) => (
                <a
                  key={amount}
                  href={`/donate?amount=${amount}`}
                  className="flex items-center justify-center py-3 px-4 rounded-lg font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700 transition-all min-h-[44px]"
                >
                  ${amount}
                </a>
              ))}
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              One-time donation. No account required.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-24">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                Why is it free?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                CacheGPT uses semantic caching to dramatically reduce API costs. When similar questions are asked, cached responses are served instantly -- saving money and giving you faster answers. This efficiency lets us offer the service for free.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                How is this sustainable?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Our caching technology reduces costs by up to 90% compared to standard AI APIs. Combined with community donations and efficient infrastructure, we can keep CacheGPT free for everyone.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                What are the limits?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                You get 500 requests per day (15,000 per month). Your daily limit resets every 24 hours. If you hit the limit, just try again tomorrow -- all features remain fully available.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                Do I need to provide API keys?
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                No! CacheGPT works out of the box with our built-in AI providers. You can optionally add your own API keys for specific providers if you prefer, but it's never required.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      </div>
    </>
  );
}
