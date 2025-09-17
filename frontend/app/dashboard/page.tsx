'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatsCard } from '@/components/dashboard/stats-card'
import { UsageChart } from '@/components/dashboard/usage-chart'
import { ApiKeysTable } from '@/components/dashboard/api-keys-table'
import UsageDashboard from '@/components/dashboard/usage-dashboard'
import { TrendingUp, DollarSign, Zap, Shield, LogOut, Crown, AlertTriangle, Settings, BarChart3, Download, Terminal } from 'lucide-react'

export default function Dashboard() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const [subscriptionDetails, setSubscriptionDetails] = useState(null)
  const [usageStats, setUsageStats] = useState(null)
  const [stats, setStats] = useState({
    totalRequests: 0,
    cacheHits: 0,
    costSaved: 0,
    avgResponseTime: 0,
  })
  const [chartData, setChartData] = useState([])
  const [apiKeys, setApiKeys] = useState([])

  useEffect(() => {
    if (!user && !loading) {
      router.push('/')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      fetchDashboardData()
      fetchSubscriptionData()
    }
  }, [user])

  const fetchSubscriptionData = async () => {
    try {
      const [subscriptionResponse, usageResponse] = await Promise.all([
        fetch('/api/subscriptions/current', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }),
        fetch('/api/subscriptions/usage', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
      ])

      if (subscriptionResponse.ok) {
        const subscriptionData = await subscriptionResponse.json()
        setSubscriptionDetails(subscriptionData)
      }

      if (usageResponse.ok) {
        const usageData = await usageResponse.json()
        setUsageStats(usageData)
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error)
    }
  }

  const fetchDashboardData = async () => {
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
        })

        // Process data for chart
        const chartDataMap = new Map()
        usageData.forEach(log => {
          const date = new Date(log.created_at).toLocaleDateString()
          if (!chartDataMap.has(date)) {
            chartDataMap.set(date, { date, total: 0, cached: 0, saved: 0 })
          }
          const dayData = chartDataMap.get(date)
          dayData.total += 1
          if (log.cache_hit) dayData.cached += 1
          dayData.saved += log.cost || 0
        })
        setChartData(Array.from(chartDataMap.values()).reverse().slice(0, 7))
      }

      // Fetch API keys
      const { data: keysData } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user?.id)

      if (keysData) {
        // Map database columns to expected interface
        const mappedKeys = keysData.map(key => ({
          id: key.id,
          name: key.key_name,     // Map key_name to name
          key: key.api_key,        // Map api_key to key
          created_at: key.created_at,
          last_used: key.last_used || null
        }))
        setApiKeys(mappedKeys)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDeleteApiKey = async (id: string) => {
    try {
      await supabase.from('api_keys').delete().eq('id', id)
      fetchDashboardData()
    } catch (error) {
      console.error('Error deleting API key:', error)
    }
  }

  const handleCreateApiKey = async (name: string) => {
    try {
      const key = 'sk-' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
      const { error } = await supabase.from('api_keys').insert({
        user_id: user?.id,
        key_name: name,  // Changed from 'name' to 'key_name'
        api_key: key,     // Changed from 'key' to 'api_key'
      })
      if (error) {
        console.error('Error creating API key:', error)
        return
      }
      fetchDashboardData()
    } catch (error) {
      console.error('Error creating API key:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const cacheHitRate = stats.totalRequests > 0
    ? ((stats.cacheHits / stats.totalRequests) * 100).toFixed(1)
    : '0'

  const getSubscriptionStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'canceled': return 'bg-red-100 text-red-800'
      case 'past_due': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const shouldShowUpgradePrompt = () => {
    return usageStats && usageStats.usage_percentage > 75
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">LLM Cache Proxy Dashboard</h1>
          <div className="flex items-center gap-4">
            {subscriptionDetails && (
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-500" />
                <Badge className={getSubscriptionStatusColor(subscriptionDetails.subscription?.status)}>
                  {subscriptionDetails.plan?.display_name}
                </Badge>
              </div>
            )}
            <span className="text-sm text-gray-600">{user.email}</span>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upgrade Prompt */}
        {shouldShowUpgradePrompt() && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Approaching Usage Limit</h4>
                    <p className="text-sm text-yellow-600">
                      You've used {usageStats?.usage_percentage?.toFixed(1)}% of your monthly quota.
                      Consider upgrading to avoid service interruption.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    View Usage
                  </Button>
                  <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700">
                    Upgrade Plan
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Tabs */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="h-4 w-4 inline mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'usage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <TrendingUp className="h-4 w-4 inline mr-2" />
              Usage & Billing
            </button>
            <button
              onClick={() => setActiveTab('api-keys')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'api-keys'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="h-4 w-4 inline mr-2" />
              API Keys
            </button>
            <button
              onClick={() => setActiveTab('cli')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'cli'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Terminal className="h-4 w-4 inline mr-2" />
              CLI Tool
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
              <StatsCard
                title="Total Requests"
                value={stats.totalRequests}
                description="All API requests processed"
                icon={Zap}
              />
              <StatsCard
                title="Cache Hit Rate"
                value={`${cacheHitRate}%`}
                description={`${stats.cacheHits} hits from cache`}
                icon={TrendingUp}
                trend={{ value: 12.5, isPositive: true }}
              />
              <StatsCard
                title="Cost Saved"
                value={`$${stats.costSaved.toFixed(2)}`}
                description="Saved through caching"
                icon={DollarSign}
              />
              <StatsCard
                title="Avg Response Time"
                value={`${stats.avgResponseTime}ms`}
                description="Average response time"
                icon={Shield}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2 mb-8">
              <UsageChart data={chartData} />

              {/* Quick Subscription Info */}
              {subscriptionDetails && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="h-5 w-5" />
                      Current Plan
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{subscriptionDetails.plan.display_name}</span>
                        <Badge className={getSubscriptionStatusColor(subscriptionDetails.subscription?.status)}>
                          {subscriptionDetails.subscription?.status}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>Monthly Requests:</span>
                          <span>{subscriptionDetails.plan.monthly_requests === -1 ? 'Unlimited' : subscriptionDetails.plan.monthly_requests.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>API Keys:</span>
                          <span>{subscriptionDetails.plan.api_keys_limit === -1 ? 'Unlimited' : subscriptionDetails.plan.api_keys_limit}</span>
                        </div>
                        {subscriptionDetails.subscription?.current_period_end && (
                          <div className="flex justify-between">
                            <span>Renewal:</span>
                            <span>{new Date(subscriptionDetails.subscription.current_period_end).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-3">
                        <Button size="sm" variant="outline" onClick={() => setActiveTab('usage')}>
                          View Usage Details
                        </Button>
                        <Button size="sm" onClick={() => router.push('/pricing')}>
                          Upgrade Plan
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {activeTab === 'usage' && <UsageDashboard />}

        {activeTab === 'api-keys' && (
          <ApiKeysTable
            apiKeys={apiKeys}
            onDelete={handleDeleteApiKey}
            onCreate={handleCreateApiKey}
          />
        )}

        {activeTab === 'cli' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  LLM Cache CLI Tool
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Download our command-line interface tool to interact with the LLM Cache Proxy directly from your terminal.
                  </p>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Windows (x64)</h4>
                    <p className="text-sm text-gray-600 mb-3">Standalone executable for Windows 64-bit systems</p>
                    <Button
                      onClick={() => window.open('/download/cli/windows', '_blank')}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download CLI (Windows)
                    </Button>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Quick Start Guide</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                      <li>Download the CLI executable for your platform</li>
                      <li>Open a terminal/command prompt in the download location</li>
                      <li>Run <code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache init</code> to configure</li>
                      <li>Enter your API endpoint: <code className="bg-gray-100 px-1 py-0.5 rounded">{window.location.origin}</code></li>
                      <li>Enter your API key from the API Keys tab</li>
                      <li>Run <code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache test</code> to verify connection</li>
                    </ol>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Available Commands</h4>
                    <div className="space-y-1 text-sm">
                      <div><code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache init</code> - Initialize configuration</div>
                      <div><code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache test</code> - Test cache functionality</div>
                      <div><code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache stats</code> - View cache statistics</div>
                      <div><code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache clear</code> - Clear cache entries</div>
                      <div><code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache config</code> - Manage configuration</div>
                      <div><code className="bg-gray-100 px-1 py-0.5 rounded">llm-cache --help</code> - Show help information</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}