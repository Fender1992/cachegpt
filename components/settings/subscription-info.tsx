'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { TrendingUp, Calendar, Heart } from 'lucide-react';

interface SubscriptionData {
  subscription_tier: string;
  subscription_status: string;
  monthly_request_count: number;
  monthly_request_limit: number;
  request_count_reset_at: string;
}

export default function SubscriptionInfo({ userId }: { userId: string }) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscription();
  }, [userId]);

  async function loadSubscription() {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('subscription_tier, subscription_status, monthly_request_count, monthly_request_limit, request_count_reset_at')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      setSubscription(profile);
    } catch (error) {
      // Silent fail - subscription info will not display
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!subscription) return null;

  const usagePercentage = (subscription.monthly_request_count / subscription.monthly_request_limit) * 100;
  const resetDate = new Date(subscription.request_count_reset_at);
  const daysUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Subscription & Usage</h3>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
          Free Forever
        </span>
      </div>

      {/* Usage Progress */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Usage</p>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {subscription.monthly_request_count.toLocaleString()} / {subscription.monthly_request_limit.toLocaleString()}
          </p>
        </div>

        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
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
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {usagePercentage.toFixed(1)}% used
          </p>
          {usagePercentage >= 80 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Running low on requests
            </p>
          )}
        </div>
      </div>

      {/* Reset Date */}
      <div className="flex items-center gap-3">
        <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">Resets in</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {daysUntilReset} day{daysUntilReset !== 1 ? 's' : ''} ({resetDate.toLocaleDateString()})
          </p>
        </div>
      </div>

      {/* Support CacheGPT */}
      <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Heart className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-pink-900 dark:text-pink-200 mb-1">
              Love CacheGPT? Help keep it free!
            </p>
            <a
              href="/donate"
              className="inline-block px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 transition-colors min-h-[44px] leading-[28px]"
            >
              Support CacheGPT
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
