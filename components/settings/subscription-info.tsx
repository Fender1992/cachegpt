'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { CreditCard, TrendingUp, Calendar, AlertCircle, XCircle, RefreshCw } from 'lucide-react';

interface SubscriptionData {
  subscription_tier: string;
  subscription_status: string;
  monthly_request_count: number;
  monthly_request_limit: number;
  request_count_reset_at: string;
  subscription_current_period_end?: string;
  cancel_at_period_end?: boolean;
}

export default function SubscriptionInfo({ userId }: { userId: string }) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, [userId]);

  async function loadSubscription() {
    try {
      // Get user profile data
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('subscription_tier, subscription_status, monthly_request_count, monthly_request_limit, request_count_reset_at, subscription_current_period_end, stripe_subscription_id')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // If user has a paid plan, get cancel_at_period_end from subscriptions table
      let cancelAtPeriodEnd = false;
      if (profile.subscription_tier !== 'free' && profile.stripe_subscription_id) {
        const { data: subscriptionData } = await supabase
          .from('subscriptions')
          .select('cancel_at_period_end')
          .eq('stripe_subscription_id', profile.stripe_subscription_id)
          .single();

        cancelAtPeriodEnd = subscriptionData?.cancel_at_period_end || false;
      }

      setSubscription({
        ...profile,
        cancel_at_period_end: cancelAtPeriodEnd,
      });
    } catch (error) {
      // Silent fail - subscription info will not display
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelSubscription() {
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel subscription');
      }

      alert('Your subscription will be canceled at the end of the current billing period. You will keep access until then.');
      await loadSubscription(); // Reload to show updated status
      setShowCancelConfirm(false);
    } catch (error: any) {
      alert(error.message || 'Failed to cancel subscription');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReactivateSubscription() {
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/subscription/reactivate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reactivate subscription');
      }

      alert('Your subscription has been reactivated successfully!');
      await loadSubscription(); // Reload to show updated status
    } catch (error: any) {
      alert(error.message || 'Failed to reactivate subscription');
    } finally {
      setActionLoading(false);
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

      {/* Cancellation Warning */}
      {subscription.cancel_at_period_end && subscription.subscription_current_period_end && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 mb-1">
                Subscription ending soon
              </p>
              <p className="text-sm text-amber-700 mb-3">
                Your subscription will end on {new Date(subscription.subscription_current_period_end).toLocaleDateString()}.
                You'll be downgraded to the free plan after this date.
              </p>
              <button
                onClick={handleReactivateSubscription}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                {actionLoading ? 'Reactivating...' : 'Reactivate Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Button (for active paid plans) */}
      {subscription.subscription_tier !== 'free' && !subscription.cancel_at_period_end && (
        <div className="border-t pt-4">
          {!showCancelConfirm ? (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Cancel Subscription
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900 mb-1">
                    Are you sure?
                  </p>
                  <p className="text-sm text-red-700 mb-3">
                    Your subscription will be canceled at the end of the current billing period.
                    You'll keep access until {subscription.subscription_current_period_end ? new Date(subscription.subscription_current_period_end).toLocaleDateString() : 'the end of the period'}.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelSubscription}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? 'Canceling...' : 'Yes, Cancel Subscription'}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Keep Subscription
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
