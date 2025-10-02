'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { CreditCard, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

interface SubscriptionData {
  subscription_tier: string;
  subscription_status: string;
  monthly_request_count: number;
  monthly_request_limit: number;
  request_count_reset_at: string;
  subscription_current_period_end?: string;
}

export default function SubscriptionInfo({ userId }: { userId: string }) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscription();
  }, [userId]);

  async function loadSubscription() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('subscription_tier, subscription_status, monthly_request_count, monthly_request_limit, request_count_reset_at, subscription_current_period_end')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setSubscription(data);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!subscription) return null;

  const usagePercentage = (subscription.monthly_request_count / subscription.monthly_request_limit) * 100;
  const resetDate = new Date(subscription.request_count_reset_at);
  const daysUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const tierColors = {
    free: 'bg-gray-100 text-gray-800 border-gray-300',
    pro: 'bg-purple-100 text-purple-800 border-purple-300',
    business: 'bg-blue-100 text-blue-800 border-blue-300',
    enterprise: 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-900 border-purple-300',
  };

  const tierColor = tierColors[subscription.subscription_tier as keyof typeof tierColors] || tierColors.free;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">Subscription & Usage</h3>
        <a
          href="/pricing"
          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          View Plans
        </a>
      </div>

      {/* Current Plan */}
      <div className="flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-gray-500" />
        <div className="flex-1">
          <p className="text-sm text-gray-500">Current Plan</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${tierColor}`}>
              {subscription.subscription_tier.charAt(0).toUpperCase() + subscription.subscription_tier.slice(1)}
            </span>
            {subscription.subscription_status !== 'active' && (
              <span className="text-sm text-amber-600">
                ({subscription.subscription_status})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Usage Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-500" />
            <p className="text-sm text-gray-500">Monthly Usage</p>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {subscription.monthly_request_count.toLocaleString()} / {subscription.monthly_request_limit.toLocaleString()}
          </p>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              usagePercentage >= 90 ? 'bg-red-500' :
              usagePercentage >= 70 ? 'bg-amber-500' :
              'bg-green-500'
            }`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">
            {usagePercentage.toFixed(1)}% used
          </p>
          {usagePercentage >= 80 && (
            <p className="text-xs text-amber-600 font-medium">
              Running low on requests
            </p>
          )}
        </div>
      </div>

      {/* Reset Date */}
      <div className="flex items-center gap-3">
        <Calendar className="w-5 h-5 text-gray-500" />
        <div className="flex-1">
          <p className="text-sm text-gray-500">Resets in</p>
          <p className="text-sm font-medium text-gray-900 mt-1">
            {daysUntilReset} day{daysUntilReset !== 1 ? 's' : ''} ({resetDate.toLocaleDateString()})
          </p>
        </div>
      </div>

      {/* Upgrade CTA */}
      {subscription.subscription_tier === 'free' && usagePercentage >= 50 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-purple-900 mb-1">
                Need more requests?
              </p>
              <p className="text-sm text-purple-700 mb-3">
                Upgrade to Pro for 10,000 requests/month at just $10/month
              </p>
              <a
                href="/pricing"
                className="inline-block px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                View Pricing Plans
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Period (for paid plans) */}
      {subscription.subscription_tier !== 'free' && subscription.subscription_current_period_end && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-500 mb-1">Next billing date</p>
          <p className="text-sm font-medium text-gray-900">
            {new Date(subscription.subscription_current_period_end).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
