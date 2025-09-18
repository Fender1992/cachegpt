'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Activity, TrendingUp, DollarSign, Zap } from 'lucide-react'

interface UsageData {
  daily: {
    requests: number
    cache_hits: number
    cache_hit_rate: number
    tokens_used: number
    cost_incurred: string
    cost_saved: string
    remaining_requests: number
    remaining_tokens: number
  }
  monthly: {
    requests: number
    cache_hits: number
    cache_hit_rate: number
    tokens_used: number
    cost_incurred: string
    cost_saved: string
    remaining_requests: number
    remaining_tokens: number
  }
  limits: {
    daily: {
      requests: number
      tokens: number
    }
    monthly: {
      requests: number
      tokens: number
    }
  }
  reset_times: {
    daily: string
    monthly: string
  }
}

export function UsageTracker({ apiKey }: { apiKey?: string }) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (apiKey) {
      fetchUsage()
      const interval = setInterval(fetchUsage, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [apiKey])

  const fetchUsage = async () => {
    if (!apiKey) return

    try {
      const response = await fetch('/api/v1/usage', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUsage(data)
      }
    } catch (error) {
      console.error('Error fetching usage:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-2 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!usage) {
    return null
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage.daily.requests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {usage.daily.remaining_requests.toLocaleString()} remaining
            </p>
            <Progress
              value={(usage.daily.requests / usage.limits.daily.requests) * 100}
              className="mt-2 h-1"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage.daily.cache_hit_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {usage.daily.cache_hits} cache hits today
            </p>
            <div className="text-xs text-green-600 mt-1">
              ${usage.daily.cost_saved} saved
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(usage.daily.tokens_used / 1000).toFixed(1)}k
            </div>
            <p className="text-xs text-muted-foreground">
              {(usage.daily.remaining_tokens / 1000).toFixed(0)}k remaining
            </p>
            <Progress
              value={(usage.daily.tokens_used / usage.limits.daily.tokens) * 100}
              className="mt-2 h-1"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${usage.monthly.cost_incurred}</div>
            <p className="text-xs text-muted-foreground">This billing period</p>
            <div className="text-xs text-green-600 mt-1">
              ${usage.monthly.cost_saved} saved from cache
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Requests</span>
                <span className="text-sm font-medium">
                  {usage.monthly.requests.toLocaleString()} / {usage.limits.monthly.requests.toLocaleString()}
                </span>
              </div>
              <Progress value={(usage.monthly.requests / usage.limits.monthly.requests) * 100} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Tokens</span>
                <span className="text-sm font-medium">
                  {(usage.monthly.tokens_used / 1000).toFixed(0)}k / {(usage.limits.monthly.tokens / 1000).toFixed(0)}k
                </span>
              </div>
              <Progress value={(usage.monthly.tokens_used / usage.limits.monthly.tokens) * 100} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cost Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">API Costs Incurred</span>
                <span className="text-sm font-medium">${usage.monthly.cost_incurred}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Saved by Caching</span>
                <span className="text-sm font-medium text-green-600">-${usage.monthly.cost_saved}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">Net Savings</span>
                  <span className="text-sm font-bold text-green-600">
                    ${(parseFloat(usage.monthly.cost_saved) - parseFloat(usage.monthly.cost_incurred)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Daily reset: {new Date(usage.reset_times.daily).toLocaleString()}</p>
              <p>Monthly reset: {new Date(usage.reset_times.monthly).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}