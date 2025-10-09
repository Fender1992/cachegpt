'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { ArrowLeft, RefreshCw, TrendingUp, Users, MessageSquare, MousePointerClick } from 'lucide-react';
import Toast from '@/components/toast';

interface FunnelMetrics {
  landing_views: number;
  landing_cta_clicks: number;
  chat_views: number;
  first_messages: number;
  modes_views: number;
  modes_selected: number;
  dashboard_views: number;
}

interface DailyMetrics {
  date: string;
  landing_views: number;
  chat_views: number;
  messages_sent: number;
}

export default function AdminFunnelReportClient() {
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    loadMetrics();
  }, [dateRange]);

  const loadMetrics = async () => {
    try {
      setLoading(true);

      // Calculate date range
      const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const startDateStr = startDate.toISOString();

      // Fetch telemetry events
      const { data: events, error } = await supabase
        .from('telemetry_events')
        .select('event_type, created_at, event_data')
        .gte('created_at', startDateStr)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Aggregate metrics
      const funnelMetrics: FunnelMetrics = {
        landing_views: 0,
        landing_cta_clicks: 0,
        chat_views: 0,
        first_messages: 0,
        modes_views: 0,
        modes_selected: 0,
        dashboard_views: 0,
      };

      const dailyMap = new Map<string, DailyMetrics>();

      events?.forEach(event => {
        const date = event.created_at.split('T')[0];

        // Initialize daily metrics if not exists
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            landing_views: 0,
            chat_views: 0,
            messages_sent: 0,
          });
        }

        const daily = dailyMap.get(date)!;

        // Count funnel events
        switch (event.event_type) {
          case 'landing_view':
            funnelMetrics.landing_views++;
            daily.landing_views++;
            break;
          case 'landing_cta_primary':
          case 'landing_cta_secondary':
            funnelMetrics.landing_cta_clicks++;
            break;
          case 'chat_view':
            funnelMetrics.chat_views++;
            daily.chat_views++;
            break;
          case 'message_sent':
            funnelMetrics.first_messages++;
            daily.messages_sent++;
            break;
          case 'modes_view':
            funnelMetrics.modes_views++;
            break;
          case 'mode_selected':
            funnelMetrics.modes_selected++;
            break;
          case 'dashboard_view':
            funnelMetrics.dashboard_views++;
            break;
        }
      });

      setMetrics(funnelMetrics);
      setDailyMetrics(Array.from(dailyMap.values()).reverse());
    } catch (error) {
      console.error('[ADMIN] Error loading metrics:', error);
      setToast({ message: 'Failed to load metrics', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const calculateConversionRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin/bugs')}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to Admin
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-purple-600" />
                Funnel Report
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Conversion metrics from landing to first message
              </p>
            </div>
            <div className="flex gap-3">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | '90d')}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              <button
                onClick={loadMetrics}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Funnel Visualization */}
        {metrics && (
          <>
            {/* Funnel Steps */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 mb-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Conversion Funnel
              </h2>

              <div className="space-y-4">
                {/* Landing Views */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Landing Views
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {metrics.landing_views.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg"></div>
                </div>

                {/* CTA Clicks */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <MousePointerClick className="w-5 h-5 text-purple-600" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        CTA Clicks
                      </span>
                      <span className="text-sm text-gray-500">
                        {calculateConversionRate(metrics.landing_cta_clicks, metrics.landing_views)} of landing views
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {metrics.landing_cta_clicks.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg transition-all"
                    style={{
                      width: `${Math.max((metrics.landing_cta_clicks / metrics.landing_views) * 100, 5)}%`
                    }}
                  ></div>
                </div>

                {/* Chat Views */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Chat Views
                      </span>
                      <span className="text-sm text-gray-500">
                        {calculateConversionRate(metrics.chat_views, metrics.landing_views)} of landing views
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {metrics.chat_views.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-lg transition-all"
                    style={{
                      width: `${Math.max((metrics.chat_views / metrics.landing_views) * 100, 5)}%`
                    }}
                  ></div>
                </div>

                {/* First Messages */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-orange-600" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        First Messages
                      </span>
                      <span className="text-sm text-gray-500">
                        {calculateConversionRate(metrics.first_messages, metrics.chat_views)} of chat views
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {metrics.first_messages.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-12 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg transition-all"
                    style={{
                      width: `${Math.max((metrics.first_messages / metrics.landing_views) * 100, 5)}%`
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Landing → Chat
                </div>
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {calculateConversionRate(metrics.chat_views, metrics.landing_views)}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Target: ≥30%
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Chat → First Message
                </div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {calculateConversionRate(metrics.first_messages, metrics.chat_views)}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Target: ≥60%
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Landing → Message
                </div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {calculateConversionRate(metrics.first_messages, metrics.landing_views)}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Overall conversion
                </div>
              </div>
            </div>

            {/* Daily Trend */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Daily Activity
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Date
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Landing Views
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Chat Views
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Messages
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Conversion
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyMetrics.map((day) => (
                      <tr key={day.date} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                          {new Date(day.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">
                          {day.landing_views.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">
                          {day.chat_views.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">
                          {day.messages_sent.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-right font-semibold text-purple-600 dark:text-purple-400">
                          {calculateConversionRate(day.messages_sent, day.landing_views)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {dailyMetrics.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    No data available for selected date range
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
