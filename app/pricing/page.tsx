'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { Check } from 'lucide-react';

interface PricingTier {
  id: string;
  name: string;
  price: number;
  interval: string;
  requests: number;
  features: string[];
  cta: string;
  popular?: boolean;
  stripePriceId?: string;
}

const pricingTiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'forever',
    requests: 1000,
    features: [
      '1,000 requests per month',
      'All AI providers (OpenAI, Claude, Gemini)',
      'Semantic caching',
      'Web dashboard',
      'CLI access',
      'Community support',
    ],
    cta: 'Get Started Free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 10,
    interval: 'month',
    requests: 10000,
    features: [
      '10,000 requests per month',
      'All AI providers',
      'Advanced semantic caching',
      'Priority support',
      'API key access',
      'Usage analytics',
      'Custom cache settings',
    ],
    cta: 'Upgrade to Pro',
    popular: true,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
  },
  {
    id: 'business',
    name: 'Business',
    price: 49,
    interval: 'month',
    requests: 100000,
    features: [
      '100,000 requests per month',
      'All Pro features',
      'Dedicated support',
      'Custom integrations',
      'Team collaboration',
      'Advanced analytics',
      'SLA guarantee',
    ],
    cta: 'Upgrade to Business',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PRICE_ID,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0,
    interval: 'custom',
    requests: 999999999,
    features: [
      'Unlimited requests',
      'All Business features',
      'On-premise deployment',
      'Custom SLA',
      'Dedicated account manager',
      'Custom development',
      'Enterprise security',
    ],
    cta: 'Contact Sales',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const [processingTier, setProcessingTier] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        if (user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('subscription_tier')
            .eq('id', user.id)
            .single();

          if (profile) {
            setCurrentTier(profile.subscription_tier || 'free');
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, [supabase]);

  async function handleUpgrade(tier: PricingTier) {
    if (!user) {
      router.push('/login?redirect=/pricing');
      return;
    }

    if (tier.id === 'enterprise') {
      window.location.href = 'mailto:sales@cachegpt.app?subject=Enterprise Plan Inquiry';
      return;
    }

    if (tier.id === 'free') {
      router.push('/dashboard');
      return;
    }

    try {
      setProcessingTier(tier.id);

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: tier.stripePriceId,
          tier: tier.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
      setProcessingTier(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              CacheGPT
            </a>
            <nav className="flex gap-6 items-center">
              <a href="/dashboard" className="text-gray-600 hover:text-purple-600 transition-colors">
                Dashboard
              </a>
              <a href="/docs" className="text-gray-600 hover:text-purple-600 transition-colors">
                Docs
              </a>
              {user ? (
                <a href="/settings" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  Settings
                </a>
              ) : (
                <a href="/login" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  Sign In
                </a>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          Start free, upgrade as you grow. Cancel anytime, no questions asked.
        </p>
        {user && currentTier !== 'free' && (
          <div className="inline-block px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            Current Plan: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="container mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {pricingTiers.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-2xl p-8 ${
                tier.popular
                  ? 'bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-2xl scale-105'
                  : 'bg-white border-2 border-gray-200 hover:border-purple-300 transition-all'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-yellow-400 text-purple-900 text-sm font-bold rounded-full">
                  MOST POPULAR
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-2xl font-bold mb-2 ${tier.popular ? 'text-white' : 'text-gray-900'}`}>
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className={`text-5xl font-bold ${tier.popular ? 'text-white' : 'text-gray-900'}`}>
                    ${tier.price}
                  </span>
                  {tier.interval !== 'custom' && (
                    <span className={`text-lg ${tier.popular ? 'text-purple-100' : 'text-gray-500'}`}>
                      /{tier.interval}
                    </span>
                  )}
                  {tier.interval === 'custom' && (
                    <span className={`text-lg ${tier.popular ? 'text-purple-100' : 'text-gray-500'}`}>
                      custom pricing
                    </span>
                  )}
                </div>
              </div>

              <div className={`mb-6 pb-6 border-b ${tier.popular ? 'border-purple-400' : 'border-gray-200'}`}>
                <p className={`text-sm ${tier.popular ? 'text-purple-100' : 'text-gray-600'}`}>
                  {tier.requests === 999999999
                    ? 'Unlimited requests'
                    : `${tier.requests.toLocaleString()} requests/month`}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${tier.popular ? 'text-purple-200' : 'text-purple-600'}`} />
                    <span className={`text-sm ${tier.popular ? 'text-purple-50' : 'text-gray-700'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(tier)}
                disabled={
                  loading ||
                  processingTier === tier.id ||
                  (user && currentTier === tier.id)
                }
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-all ${
                  tier.popular
                    ? 'bg-white text-purple-600 hover:bg-purple-50'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                } ${
                  user && currentTier === tier.id
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading
                  ? 'Loading...'
                  : processingTier === tier.id
                  ? 'Processing...'
                  : user && currentTier === tier.id
                  ? 'Current Plan'
                  : tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-24">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold mb-2 text-gray-900">
                Can I change plans anytime?
              </h3>
              <p className="text-gray-600">
                Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect immediately, and we'll prorate any charges.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold mb-2 text-gray-900">
                What happens if I exceed my request limit?
              </h3>
              <p className="text-gray-600">
                Your requests will be paused until the next billing cycle or you can upgrade to a higher tier. We'll send you email notifications at 80% and 100% usage.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold mb-2 text-gray-900">
                Do you offer refunds?
              </h3>
              <p className="text-gray-600">
                We offer a 30-day money-back guarantee on all paid plans. If you're not satisfied, contact us for a full refund.
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold mb-2 text-gray-900">
                Is there a setup fee?
              </h3>
              <p className="text-gray-600">
                No setup fees, ever. You only pay the monthly subscription price for your chosen tier.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-8 text-center text-gray-600">
          <p>&copy; 2025 CacheGPT. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
