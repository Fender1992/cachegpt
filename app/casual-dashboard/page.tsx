'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquare, Zap, Cpu, Award, TrendingUp } from 'lucide-react';
import telemetry from '@/lib/telemetry';

interface DashboardStats {
  totalChats: number;
  cacheHitPercentage: number;
  topModel: string;
}

interface Badge {
  achievement_key: string;
  unlocked_at: string;
}

interface ActivityByDay {
  [date: string]: number;
}

const badgeInfo: { [key: string]: { icon: string; title: string; description: string } } = {
  first_10_chats: {
    icon: '🎉',
    title: 'Getting Started',
    description: 'Completed your first 10 chats',
  },
  cache_hero_80: {
    icon: '⚡',
    title: 'Cache Hero',
    description: '80% cache hit rate achieved',
  },
  prompt_master_100: {
    icon: '🎯',
    title: 'Prompt Master',
    description: 'Sent 100+ messages',
  },
  early_adopter: {
    icon: '🚀',
    title: 'Early Adopter',
    description: 'Joined during beta',
  },
  speed_demon: {
    icon: '💨',
    title: 'Speed Demon',
    description: 'Saved 10+ seconds with cache',
  },
};

export default function CasualDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activityByDay, setActivityByDay] = useState<ActivityByDay>({});
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      // Track dashboard view
      telemetry.dashboardView();

      // Fetch dashboard stats
      fetchDashboardStats();
    }
  }, [user, authLoading, router]);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/dashboard-stats');
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats');
      }

      const data = await response.json();
      setStats(data.stats);
      setActivityByDay(data.activityByDay);
      setBadges(data.badges);

      // Track stats loaded
      telemetry.statsLoaded();
    } catch (err) {
      console.error('[DASHBOARD] Error:', err);
      setError('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboardStats}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Prepare chart data (last 14 days)
  const chartDates: string[] = [];
  const chartValues: number[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    chartDates.push(dayLabel);
    chartValues.push(activityByDay[dateStr] || 0);
  }

  const maxValue = Math.max(...chartValues, 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Your Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track your AI activity and achievements
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Chats */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {stats?.totalChats || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Chats</div>
          </div>

          {/* Cache Hit Rate */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {stats?.cacheHitPercentage || 0}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Cache Hits</div>
          </div>

          {/* Top Model */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Cpu className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1 truncate">
              {stats?.topModel || 'N/A'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Favorite Model</div>
          </div>
        </div>

        {/* Activity Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
          <div className="flex items-center mb-6">
            <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-2" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Your AI Activity (Last 14 Days)
            </h2>
          </div>

          <div className="space-y-4">
            {chartDates.map((date, index) => {
              const value = chartValues[index];
              const percentage = (value / maxValue) * 100;

              return (
                <div key={date} className="flex items-center gap-4">
                  <div className="w-16 text-xs text-gray-600 dark:text-gray-400 text-right">
                    {date}
                  </div>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-8 relative overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                      style={{ width: `${Math.max(percentage, value > 0 ? 10 : 0)}%` }}
                    >
                      {value > 0 && (
                        <span className="text-xs font-medium text-white">{value}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {chartValues.every(v => v === 0) && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No activity yet. Start chatting to see your progress!</p>
            </div>
          )}
        </div>

        {/* Badges Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center mb-6">
            <Award className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-2" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Badges</h2>
          </div>

          {badges.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {badges.map((badge) => {
                const info = badgeInfo[badge.achievement_key] || {
                  icon: '🏆',
                  title: badge.achievement_key,
                  description: 'Achievement unlocked',
                };

                return (
                  <div
                    key={badge.achievement_key}
                    className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-4 border-2 border-purple-200 dark:border-purple-700"
                  >
                    <div className="text-4xl mb-2">{info.icon}</div>
                    <div className="font-bold text-gray-900 dark:text-white mb-1">
                      {info.title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {info.description}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {new Date(badge.unlocked_at).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Award className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No badges yet!</p>
              <p className="text-sm">
                Keep chatting to unlock achievements and earn badges
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
