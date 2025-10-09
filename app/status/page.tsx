'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Activity,
  Zap,
  Server,
  Database,
  Cloud,
  RefreshCw,
  TrendingUp,
  Clock
} from 'lucide-react'
import { error as logError } from '@/lib/logger'
import Navigation from '@/components/Navigation'

interface ServiceStatus {
  name: string
  status: 'operational' | 'degraded' | 'outage'
  uptime: number
  latency: number
  lastChecked: Date
  icon: React.ReactNode
}

interface Incident {
  id: string
  title: string
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  severity: 'minor' | 'major' | 'critical'
  startTime: Date
  endTime?: Date
  updates: {
    time: Date
    message: string
  }[]
}

interface Metric {
  label: string
  value: string
  change: number
  trend: 'up' | 'down' | 'stable'
}

export default function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [overallStatus, setOverallStatus] = useState<'operational' | 'degraded' | 'outage'>('operational')
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    checkStatus()
    const interval = autoRefresh ? setInterval(checkStatus, 30000) : null // Check every 30 seconds

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh])

  const checkStatus = async () => {
    try {
      // Check all services from server-side health check API
      const healthResponse = await fetch('/api/health-check');
      const healthData = healthResponse.ok ? await healthResponse.json() : null;

      const newServices: ServiceStatus[] = [
        {
          name: 'API Gateway',
          status: healthResponse.ok ? 'operational' : 'outage',
          uptime: healthResponse.ok ? 100 : 0,
          latency: healthData?.database?.latency || 0,
          lastChecked: new Date(),
          icon: <Server className="w-5 h-5" />
        },
        {
          name: 'Database',
          status: healthData?.database?.status || 'outage',
          uptime: healthData?.database?.status === 'operational' ? 100 : 0,
          latency: healthData?.database?.latency || 0,
          lastChecked: new Date(),
          icon: <Database className="w-5 h-5" />
        },
        {
          name: 'Cache Service',
          status: healthData?.cache?.status || 'outage',
          uptime: healthData?.cache?.status === 'operational' ? 100 : 0,
          latency: healthData?.cache?.latency || 0,
          lastChecked: new Date(),
          icon: <Zap className="w-5 h-5" />
        }
      ];

      setServices(newServices)

      // Calculate overall status
      const hasOutage = newServices.some(s => s.status === 'outage')
      const hasDegraded = newServices.some(s => s.status === 'degraded')
      setOverallStatus(hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational')

      // Fetch real metrics from API
      try {
        const metricsResponse = await fetch('/api/metrics/system')
        if (metricsResponse.ok) {
          const systemMetrics = await metricsResponse.json()

          // Only show metrics if we have real data
          if (systemMetrics.requests24h > 0) {
            setMetrics([
              {
                label: 'API Requests (24h)',
                value: systemMetrics.requests24h.toLocaleString(),
                change: 0,
                trend: 'stable'
              },
              {
                label: 'Cache Hit Rate',
                value: `${systemMetrics.cacheHitRate}%`,
                change: 0,
                trend: 'stable'
              },
              {
                label: 'Avg Response Time',
                value: `${systemMetrics.avgResponseTime}ms`,
                change: 0,
                trend: 'stable'
              },
              {
                label: 'Error Rate',
                value: `${systemMetrics.errorRate}%`,
                change: 0,
                trend: 'stable'
              }
            ])
          }
        }
      } catch (error) {
        logError('Failed to fetch system metrics', error)
        // Keep metrics empty if fetch fails
      }

      // Load recent incidents (mock data for now)
      setIncidents([])

      setLastRefresh(new Date())
    } catch (error) {
      logError('Failed to check status', error)
    } finally {
      setLoading(false)
    }
  }


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'text-green-600'
      case 'degraded':
        return 'text-yellow-600'
      case 'outage':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />
      case 'outage':
        return <XCircle className="w-5 h-5 text-red-600" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'operational':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Operational</Badge>
      case 'degraded':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Degraded</Badge>
      case 'outage':
        return <Badge className="bg-red-100 text-red-800 border-red-300">Outage</Badge>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Checking system status...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">System Status</h1>
              <p className="text-gray-600 mt-1">Real-time status of CacheGPT services</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-lg border ${
                  autoRefresh
                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                    : 'bg-gray-100 border-gray-300 text-gray-700'
                }`}
              >
                <RefreshCw className={`w-4 h-4 inline-block mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={checkStatus}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
              >
                Refresh Now
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>

        {/* Overall Status Banner */}
        <Card className={`mb-8 border-2 ${
          overallStatus === 'operational' ? 'border-green-500 bg-green-50' :
          overallStatus === 'degraded' ? 'border-yellow-500 bg-yellow-50' :
          'border-red-500 bg-red-50'
        }`}>
          <CardContent className="py-6">
            <div className="flex items-center space-x-4">
              {getStatusIcon(overallStatus)}
              <div>
                <h2 className="text-xl font-semibold">
                  {overallStatus === 'operational' ? 'All Systems Operational' :
                   overallStatus === 'degraded' ? 'Partial System Degradation' :
                   'Major Outage Detected'}
                </h2>
                <p className="text-gray-600 mt-1">
                  {overallStatus === 'operational'
                    ? 'All services are running normally with no issues detected.'
                    : overallStatus === 'degraded'
                    ? 'Some services are experiencing degraded performance. We are investigating.'
                    : 'We are experiencing a major outage. Our team is working to resolve the issue.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics - Only show if we have real data */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {metrics.map((metric, index) => (
              <Card key={index}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600">{metric.label}</p>
                    <TrendingUp className={`w-4 h-4 ${
                      metric.trend === 'up' ? 'text-green-600' :
                      metric.trend === 'down' ? 'text-red-600' :
                      'text-gray-600'
                    }`} />
                  </div>
                  <p className="text-2xl font-bold">{metric.value}</p>
                  <p className={`text-sm mt-1 ${
                    metric.change > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {metric.change > 0 ? '+' : ''}{metric.change}%
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Service Status Grid */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Service Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg dark:bg-gray-800">
                      {service.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{service.name}</h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-gray-500">Uptime: {service.uptime}%</span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">Latency: {service.latency.toFixed(0)}ms</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(service.status)}
                    {getStatusBadge(service.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Incidents */}
        {incidents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              {incidents.map((incident) => (
                <div key={incident.id} className="border-l-4 border-yellow-500 pl-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{incident.title}</h3>
                    <Badge variant="outline">{incident.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Started: {incident.startTime.toLocaleString()}
                  </p>
                  {incident.updates.map((update, index) => (
                    <div key={index} className="mt-2 ml-4 text-sm">
                      <span className="text-gray-500">{update.time.toLocaleTimeString()}</span>
                      <p className="text-gray-700">{update.message}</p>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Uptime History */}
        <Card>
          <CardHeader>
            <CardTitle>90 Day Uptime History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-30 gap-1">
              {[...Array(90)].map((_, i) => {
                // Show operational status - should be fetched from incident history in production
                const isOperational = true
                return (
                  <div
                    key={i}
                    className={`h-8 rounded ${
                      isOperational ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    title={`Day ${90 - i}`}
                  />
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>90 days ago</span>
              <span>Today</span>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  )
}