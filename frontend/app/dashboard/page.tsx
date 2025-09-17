'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, DollarSign, Zap, Shield, LogOut, Crown,
  AlertTriangle, Settings, BarChart3, Download, Terminal,
  Activity, Users, Database, Clock, ChevronUp, ChevronDown,
  Cpu, Globe, Code, ArrowUpRight, RefreshCw, Plus, Eye,
  Copy, Trash2, MoreVertical, Filter, Search
} from 'lucide-react'

interface Stat {
  title: string
  value: string | number
  change: number
  icon: React.ReactNode
  color: string
  bgColor: string
}

export default function Dashboard() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const [timeRange, setTimeRange] = useState('7d')
  const [refreshing, setRefreshing] = useState(false)
  const [showApiKey, setShowApiKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [stats, setStats] = useState({
    totalRequests: 0,
    cacheHits: 0,
    costSaved: 0,
    avgResponseTime: 0,
    activeUsers: 0,
    apiCalls: 0,
    dataProcessed: 0,
    uptime: 99.9
  })

  const [chartData, setChartData] = useState([])
  const [apiKeys, setApiKeys] = useState([])
  const [recentActivity, setRecentActivity] = useState([])

  useEffect(() => {
    if (!user && !loading) {
      router.push('/')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user, timeRange])

  const fetchDashboardData = async () => {
    setRefreshing(true)
    try {
      // Fetch usage statistics
      const { data: usageData } = await supabase
        .from('usage_logs')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (usageData) {
        const totalRequests = usageData.length
        const cacheHits = usageData.filter(log => log.cache_hit).length
        const costSaved = usageData.reduce((sum, log) => sum + (log.cost || 0), 0)
        const avgResponseTime = usageData.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / totalRequests

        setStats({
          totalRequests,
          cacheHits,
          costSaved,
          avgResponseTime: Math.round(avgResponseTime),
          activeUsers: Math.floor(Math.random() * 50) + 10,
          apiCalls: totalRequests * 2,
          dataProcessed: Math.floor(totalRequests * 1.5),
          uptime: 99.9
        })

        // Process data for chart
        const chartDataMap = new Map()
        usageData.forEach(log => {
          const date = new Date(log.created_at).toLocaleDateString()
          if (!chartDataMap.has(date)) {
            chartDataMap.set(date, { date, requests: 0, cached: 0 })
          }
          const dayData = chartDataMap.get(date)
          dayData.requests++
          if (log.cache_hit) dayData.cached++
        })
        setChartData(Array.from(chartDataMap.values()).slice(0, 7).reverse())
      }

      // Fetch API keys
      const { data: keysData } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

      if (keysData) {
        setApiKeys(keysData)
      }

      // Generate mock recent activity
      setRecentActivity([
        { id: 1, action: 'API Call', model: 'gpt-4', status: 'cached', time: '2 mins ago', saved: '$0.02' },
        { id: 2, action: 'API Call', model: 'claude-2', status: 'miss', time: '5 mins ago', saved: '$0.00' },
        { id: 3, action: 'API Call', model: 'gpt-3.5-turbo', status: 'cached', time: '8 mins ago', saved: '$0.01' },
        { id: 4, action: 'Key Created', model: '-', status: 'success', time: '1 hour ago', saved: '-' },
        { id: 5, action: 'API Call', model: 'gpt-4', status: 'cached', time: '2 hours ago', saved: '$0.02' }
      ])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const copyApiKey = (key: string) => {
    navigator.clipboard.writeText(key)
    // Show toast notification
  }

  const statCards: Stat[] = [
    {
      title: 'Total Requests',
      value: stats.totalRequests.toLocaleString(),
      change: 12.5,
      icon: <Activity className="w-5 h-5" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Cache Hit Rate',
      value: stats.totalRequests ? `${((stats.cacheHits / stats.totalRequests) * 100).toFixed(1)}%` : '0%',
      change: 8.2,
      icon: <Zap className="w-5 h-5" />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Cost Saved',
      value: `$${stats.costSaved.toFixed(2)}`,
      change: 23.1,
      icon: <DollarSign className="w-5 h-5" />,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Avg Response',
      value: `${stats.avgResponseTime}ms`,
      change: -15.3,
      icon: <Clock className="w-5 h-5" />,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ]

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'api-keys', label: 'API Keys', icon: <Shield className="w-4 h-4" /> },
    { id: 'usage', label: 'Usage', icon: <Activity className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> }
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Background Pattern */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 grid-pattern opacity-50"></div>
        <div className="absolute inset-0 mesh-gradient opacity-20"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">CacheGPT Dashboard</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Welcome back, {user?.email}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => fetchDashboardData()}
                className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition ${refreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <div className="relative group">
                <div className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 cursor-pointer">
                  <Crown className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium">Free Plan</span>
                </div>
                <div className="absolute right-0 mt-2 w-48 glass-card rounded-lg shadow-lg p-2 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all">
                  <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-sm">
                    Upgrade to Pro
                  </button>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex items-center space-x-1 mb-8 p-1 glass-card rounded-xl w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-800 shadow-sm text-purple-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Time Range Selector */}
        {activeTab === 'overview' && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Dashboard Overview</h2>
            <div className="flex items-center space-x-2">
              {['24h', '7d', '30d', '90d'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                    timeRange === range
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((stat, index) => (
                <div
                  key={index}
                  className="glass-card rounded-2xl p-6 card-lift cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl ${stat.bgColor} ${stat.color} group-hover:scale-110 transition-transform`}>
                      {stat.icon}
                    </div>
                    <div className={`flex items-center space-x-1 text-sm ${
                      stat.change > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stat.change > 0 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span>{Math.abs(stat.change)}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{stat.title}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usage Chart */}
              <Card className="glass-card border-0">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Usage Trends</span>
                    <BarChart3 className="w-5 h-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-end justify-between space-x-2">
                    {chartData.length > 0 ? (
                      chartData.map((day, index) => (
                        <div key={index} className="flex-1 flex flex-col items-center">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-t relative" style={{ height: `${(day.requests / Math.max(...chartData.map(d => d.requests))) * 200}px` }}>
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-purple-500 to-purple-400 rounded-t"
                              style={{ height: `${(day.cached / day.requests) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500 mt-2">{day.date.split('/')[1]}</span>
                        </div>
                      ))
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No data available
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center space-x-6 mt-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total Requests</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-purple-500 rounded"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Cached</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="glass-card border-0">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Recent Activity</span>
                    <Activity className="w-5 h-5 text-gray-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            activity.status === 'cached' ? 'bg-green-500' :
                            activity.status === 'miss' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`}></div>
                          <div>
                            <p className="text-sm font-medium">{activity.action}</p>
                            <p className="text-xs text-gray-500">{activity.model}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{activity.time}</p>
                          {activity.saved !== '-' && (
                            <p className="text-xs text-green-600 font-medium">{activity.saved}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button className="glass-card rounded-2xl p-6 text-left hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <Terminal className="w-8 h-8 text-purple-600" />
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
                <h3 className="font-semibold mb-1">CLI Documentation</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Learn how to use our CLI tool</p>
              </button>

              <button className="glass-card rounded-2xl p-6 text-left hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <Code className="w-8 h-8 text-blue-600" />
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
                <h3 className="font-semibold mb-1">API Reference</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Explore our API endpoints</p>
              </button>

              <button className="glass-card rounded-2xl p-6 text-left hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <Globe className="w-8 h-8 text-green-600" />
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
                <h3 className="font-semibold mb-1">Integration Guide</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Connect with your stack</p>
              </button>
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">API Keys Management</h2>
              <button className="btn-glow flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Create New Key</span>
              </button>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center space-x-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search keys..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 input-modern"
                  />
                </div>
                <button className="p-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-purple-500 transition">
                  <Filter className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {apiKeys.length > 0 ? (
                  apiKeys.filter(key => key.key_name.toLowerCase().includes(searchQuery.toLowerCase())).map((key) => (
                    <div key={key.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-500 transition">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                          <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{key.key_name}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <code className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                              {showApiKey === key.id ? key.api_key : `sk-...${key.api_key.slice(-8)}`}
                            </code>
                            <Badge variant={key.is_active ? 'default' : 'secondary'}>
                              {key.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setShowApiKey(showApiKey === key.id ? null : key.id)}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copyApiKey(key.api_key)}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-4">No API keys yet</p>
                    <button className="btn-glow">Create Your First Key</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}