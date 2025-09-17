'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  TrendingUp,
  Zap,
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Settings
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface UsageStats {
  current_month: {
    requests_made: number;
    cache_hits: number;
    cache_misses: number;
    tokens_saved: number;
    cost_saved: number;
  };
  previous_months: Array<{
    month: number;
    year: number;
    requests_made: number;
    cache_hits: number;
    tokens_saved: number;
    cost_saved: number;
  }>;
  usage_percentage: number;
  requests_remaining: number;
  days_until_reset: number;
  is_over_limit: boolean;
}

interface SubscriptionDetails {
  plan: {
    name: string;
    display_name: string;
    monthly_requests: number;
    max_cache_entries: number;
    api_keys_limit: number;
  };
  subscription: {
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
  features: Array<{
    feature_name: string;
    is_enabled: boolean;
  }>;
}

export default function UsageDashboard() {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [usageResponse, subscriptionResponse] = await Promise.all([
        fetch('/api/subscriptions/usage', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }),
        fetch('/api/subscriptions/current', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
      ]);

      if (usageResponse.ok && subscriptionResponse.ok) {
        const [usageData, subscriptionData] = await Promise.all([
          usageResponse.json(),
          subscriptionResponse.json()
        ]);

        setUsageStats(usageData);
        setSubscriptionDetails(subscriptionData);
      } else {
        setError('Failed to fetch dashboard data');
      }
    } catch (err) {
      setError('Error loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 75) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getUsageBarColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !usageStats || !subscriptionDetails) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Dashboard</h3>
          <p className="text-gray-600 mb-4">{error || 'Please try again later'}</p>
          <Button onClick={fetchDashboardData}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const cacheHitRate = usageStats.current_month.requests_made > 0
    ? (usageStats.current_month.cache_hits / usageStats.current_month.requests_made) * 100
    : 0;

  // Prepare chart data
  const monthlyTrendData = usageStats.previous_months.map(month => ({
    name: `${month.year}-${month.month.toString().padStart(2, '0')}`,
    requests: month.requests_made,
    cache_hits: month.cache_hits,
    cost_saved: month.cost_saved
  })).reverse();

  const pieData = [
    { name: 'Cache Hits', value: usageStats.current_month.cache_hits, color: '#10B981' },
    { name: 'Cache Misses', value: usageStats.current_month.cache_misses, color: '#EF4444' }
  ];

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {usageStats.is_over_limit && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div className="flex-1">
                <h4 className="font-medium text-red-800">Usage Limit Exceeded</h4>
                <p className="text-sm text-red-600">
                  You've exceeded your monthly request limit. Consider upgrading your plan.
                </p>
              </div>
              <Button size="sm" className="bg-red-600 hover:bg-red-700">
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
          <Settings className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">{subscriptionDetails.plan.display_name}</div>
              <div className="flex items-center gap-2 mt-2">
                <Badge
                  variant={subscriptionDetails.subscription.status === 'active' ? 'default' : 'secondary'}
                >
                  {subscriptionDetails.subscription.status}
                </Badge>
                {subscriptionDetails.subscription.cancel_at_period_end && (
                  <Badge variant="outline" className="text-yellow-600">
                    Canceling at period end
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm">
              Manage Plan
            </Button>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Renews on {new Date(subscriptionDetails.subscription.current_period_end).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>

      {/* Usage Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests This Month</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(usageStats.current_month.requests_made)}</div>
            <div className="mt-2">
              <Progress
                value={usageStats.usage_percentage}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {usageStats.requests_remaining === -1 ? 'Unlimited' : `${formatNumber(usageStats.requests_remaining)} remaining`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheHitRate.toFixed(1)}%</div>
            <div className="flex items-center mt-2 text-sm">
              <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
              <span className="text-green-600">
                {usageStats.current_month.cache_hits} hits of {usageStats.current_month.requests_made} requests
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Saved</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(usageStats.current_month.cost_saved)}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {formatNumber(usageStats.current_month.tokens_saved)} tokens saved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days Until Reset</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usageStats.days_until_reset}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Usage resets monthly
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Usage Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatNumber(value), name]}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.3}
                    name="Requests"
                  />
                  <Area
                    type="monotone"
                    dataKey="cache_hits"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.3}
                    name="Cache Hits"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cache Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Cache Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatNumber(value), '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm">Cache Hits ({usageStats.current_month.cache_hits})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-sm">Cache Misses ({usageStats.current_month.cache_misses})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Limits & Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Monthly Requests</span>
                <span className="text-sm text-gray-500">
                  {formatNumber(usageStats.current_month.requests_made)} / {subscriptionDetails.plan.monthly_requests === -1 ? '∞' : formatNumber(subscriptionDetails.plan.monthly_requests)}
                </span>
              </div>
              <Progress value={usageStats.usage_percentage} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {usageStats.usage_percentage.toFixed(1)}% used
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Cache Entries</span>
                <span className="text-sm text-gray-500">
                  Limit: {subscriptionDetails.plan.max_cache_entries === -1 ? '∞' : formatNumber(subscriptionDetails.plan.max_cache_entries)}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div className="h-2 bg-blue-500 rounded-full w-1/3"></div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Current usage unavailable
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">API Keys</span>
                <span className="text-sm text-gray-500">
                  Limit: {subscriptionDetails.plan.api_keys_limit === -1 ? '∞' : subscriptionDetails.plan.api_keys_limit}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full">
                <div className="h-2 bg-green-500 rounded-full w-1/4"></div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Current usage unavailable
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Optimization Tips
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Great cache hit rate!</p>
                <p className="text-xs text-gray-600">Your {cacheHitRate.toFixed(1)}% hit rate is saving significant costs.</p>
              </div>
            </div>
            {usageStats.usage_percentage > 75 && (
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Consider upgrading</p>
                  <p className="text-xs text-gray-600">You're using {usageStats.usage_percentage.toFixed(1)}% of your monthly limit.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Settings className="h-4 w-4 mr-2" />
              Manage API Keys
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Detailed Analytics
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <TrendingUp className="h-4 w-4 mr-2" />
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}