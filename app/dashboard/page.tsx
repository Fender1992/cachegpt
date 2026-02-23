'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase-client'
import {
  MessageSquare, Zap, Cpu, Award, TrendingUp, DollarSign,
  Clock, RefreshCw, Activity, BarChart3, Leaf, Droplets, BatteryCharging
} from 'lucide-react'
import { telemetry } from '@/lib/telemetry'
import { apiFetch } from '@/lib/api-client'
import Navigation from '@/components/Navigation'

interface DashboardStats {
  totalChats: number
  cacheHitPercentage: number
  topModel: string
  costSaved?: number
  avgResponseTime?: number
}

interface Badge {
  achievement_key: string
  unlocked_at: string
}

interface ActivityByDay {
  [date: string]: number
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
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activityByDay, setActivityByDay] = useState<ActivityByDay>({})
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }

    if (user) {
      telemetry.dashboardView()
      fetchDashboardStats()
    }
  }, [user, authLoading, router])

  const fetchDashboardStats = async () => {
    try {
      setLoading(true)
      setError(null)
      setRefreshing(true)

      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await apiFetch('/api/dashboard-stats', {
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats')
      }

      const data = await response.json()
      setStats(data.stats)
      setActivityByDay(data.activityByDay)
      setBadges(data.badges)

      telemetry.statsLoaded()
    } catch (err) {
      setError('Failed to load dashboard stats')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (authLoading || loading) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Navigation />
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
      </>
    )
  }

  // Prepare chart data (last 14 days)
  const chartDates: string[] = []
  const chartValues: number[] = []
  const today = new Date()
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    chartDates.push(dayLabel)
    chartValues.push(activityByDay[dateStr] || 0)
  }

  const maxValue = Math.max(...chartValues, 1)

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Your Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Track your AI activity and achievements
              </p>
            </div>
            <button
              onClick={fetchDashboardStats}
              className={`p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition ${refreshing ? 'animate-spin' : ''}`}
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Hero Savings Card */}
          {stats && (() => {
            const totalSaved = (stats.costSaved ?? 0) > 0
              ? (stats.costSaved ?? 0)
              : (stats.cacheHitPercentage / 100) * stats.totalChats * 0.03;
            return (
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 rounded-2xl p-6 sm:p-8 shadow-xl shadow-green-500/20 mb-8 text-white">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex-1">
                  <p className="text-green-100 text-sm font-medium uppercase tracking-wide mb-1">Total Saved</p>
                  <div className="text-3xl sm:text-5xl font-bold mb-2">
                    ${totalSaved.toFixed(2)}
                  </div>
                  <p className="text-green-100 text-sm">
                    from {stats.totalChats} chats with {stats.cacheHitPercentage}% cache hit rate
                  </p>
                  {/* Environmental Impact */}
                  {(() => {
                    const cacheHits = Math.round((stats.cacheHitPercentage / 100) * stats.totalChats);
                    const co2Saved = (cacheHits * 0.5).toFixed(1);
                    const waterSaved = (cacheHits * 3).toFixed(0);
                    const energySaved = (cacheHits * 0.002).toFixed(2);
                    return cacheHits > 0 ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-green-100 text-xs">
                        <span className="flex items-center gap-1">
                          <Leaf className="w-3.5 h-3.5" />
                          {co2Saved}g CO₂ saved
                        </span>
                        <span className="flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5" />
                          {waterSaved}ml water saved
                        </span>
                        <span className="flex items-center gap-1">
                          <BatteryCharging className="w-3.5 h-3.5" />
                          {energySaved} kWh saved
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="flex flex-col items-center gap-3">
                  {/* Cache hit rate ring */}
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24">
                    <svg className="w-20 h-20 sm:w-24 sm:h-24 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8"
                        strokeDasharray={`${(stats.cacheHitPercentage / 100) * 263.9} 263.9`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold">{stats.cacheHitPercentage}%</span>
                    </div>
                  </div>
                  <span className="text-green-100 text-xs font-medium">Cache Hit Rate</span>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(true)}
                className="mt-4 px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-colors min-h-[44px]"
              >
                Share My Stats
              </button>
            </div>
            );
          })()}

          {/* Share Stats Modal */}
          {showShareModal && stats && (() => {
            const savedAmount = (stats.costSaved ?? 0) > 0
              ? (stats.costSaved ?? 0)
              : (stats.cacheHitPercentage / 100) * stats.totalChats * 0.03;
            const shareText = `I've saved $${savedAmount.toFixed(2)} with @CacheGPT! Free AI chat with semantic caching. Try it: https://cachegpt.app`;
            return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-[90]">
              <div className="bg-white dark:bg-gray-900 w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Share Your Stats</h3>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {shareText}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 mb-6">
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-black dark:bg-white dark:text-black text-white rounded-xl font-medium transition-colors hover:opacity-90 min-h-[44px]"
                    >
                      Share on X
                    </a>
                    <button
                      onClick={() => navigator.clipboard.writeText(shareText)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-medium transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 min-h-[44px]"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      You&apos;ve saved ${savedAmount.toFixed(2)}. Help keep it free &rarr;{' '}
                      <a href="/donate" className="text-green-600 dark:text-green-400 font-medium hover:underline">
                        Support CacheGPT
                      </a>
                    </p>
                  </div>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-medium transition-colors min-h-[44px]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
            );
          })()}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

            {/* Cost Saved */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                ${stats?.costSaved?.toFixed(2) || '0.00'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Cost Saved</div>
            </div>

            {/* Top Model */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white mb-1 truncate">
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
                <span className="hidden sm:inline">Your AI Activity (Last 14 Days)</span>
                <span className="sm:hidden">Your AI Activity (Last 7 Days)</span>
              </h2>
            </div>

            <div className="space-y-2 sm:space-y-4">
              {chartDates.map((date, index) => {
                const value = chartValues[index]
                const percentage = (value / maxValue) * 100

                return (
                  <div key={date} className={`flex items-center gap-4${index < 7 ? ' hidden sm:flex' : ''}`}>
                    <div className="w-12 sm:w-16 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 text-right">
                      {date}
                    </div>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 sm:h-8 relative overflow-hidden">
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
                )
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
                  }

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
                  )
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
    </>
  )
}
