import { NextRequest, NextResponse } from 'next/server'
import { cacheLifecycleManager } from '@/lib/cache-lifecycle'
import { requireAdminAuth } from '@/lib/admin-auth'

/**
 * Cache Health Dashboard API
 *
 * Provides metrics and insights into cache health:
 * - Lifecycle distribution (hot, warm, cool, cold, stale)
 * - Health score over time
 * - Access patterns and trends
 * - Recommendations for optimization
 */

export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdminAuth()

    if (!authResult.success) {
      return authResult.response
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    // Fetch historical stats
    const stats = await cacheLifecycleManager.getCacheHealthStats(days)

    if (!stats || stats.length === 0) {
      return NextResponse.json({
        message: 'No cache health data available. Run metadata scan first.',
        recommendation: 'Visit /api/cron/scan-cache-metadata to trigger initial scan'
      }, { status: 404 })
    }

    // Calculate trends
    const latest = stats[0]
    const oldest = stats[stats.length - 1]

    const trends = {
      health_score: calculateTrend(oldest.cache_health_score, latest.cache_health_score),
      hot_entries: calculateTrend(oldest.hot_count, latest.hot_count),
      stale_entries: calculateTrend(oldest.stale_count, latest.stale_count),
      avg_access_count: calculateTrend(oldest.avg_access_count, latest.avg_access_count)
    }

    // Generate insights
    const insights = generateInsights(latest, trends)

    return NextResponse.json({
      summary: {
        current_health_score: Math.round(latest.cache_health_score * 100) / 100,
        total_entries: latest.total_entries,
        deleted_today: latest.deleted_count,
        lifecycle_distribution: {
          hot: {
            count: latest.hot_count,
            percentage: calculatePercentage(latest.hot_count, latest.total_entries)
          },
          warm: {
            count: latest.warm_count,
            percentage: calculatePercentage(latest.warm_count, latest.total_entries)
          },
          cool: {
            count: latest.cool_count,
            percentage: calculatePercentage(latest.cool_count, latest.total_entries)
          },
          cold: {
            count: latest.cold_count,
            percentage: calculatePercentage(latest.cold_count, latest.total_entries)
          },
          stale: {
            count: latest.stale_count,
            percentage: calculatePercentage(latest.stale_count, latest.total_entries)
          }
        },
        metrics: {
          avg_access_count: Math.round(latest.avg_access_count * 100) / 100,
          avg_age_days: Math.round(latest.avg_age_days * 100) / 100
        }
      },
      trends: {
        period_days: days,
        health_score_trend: trends.health_score,
        hot_entries_trend: trends.hot_entries,
        stale_entries_trend: trends.stale_entries,
        access_count_trend: trends.avg_access_count
      },
      historical_data: stats.map(s => ({
        date: s.scan_date,
        health_score: Math.round(s.cache_health_score * 100) / 100,
        total_entries: s.total_entries,
        hot: s.hot_count,
        warm: s.warm_count,
        cool: s.cool_count,
        cold: s.cold_count,
        stale: s.stale_count,
        deleted: s.deleted_count
      })),
      insights,
      recommendations: generateRecommendations(latest, trends)
    })

  } catch (error) {
    console.error('[CACHE-HEALTH] Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch cache health data',
      details: (error as Error).message
    }, { status: 500 })
  }
}

/**
 * Calculate trend (positive = improving, negative = declining)
 */
function calculateTrend(oldValue: number, newValue: number): {
  direction: 'up' | 'down' | 'stable',
  change: number,
  percentage: number
} {
  const change = newValue - oldValue
  const percentage = oldValue > 0 ? (change / oldValue) * 100 : 0

  let direction: 'up' | 'down' | 'stable' = 'stable'
  if (Math.abs(percentage) > 5) {
    direction = change > 0 ? 'up' : 'down'
  }

  return {
    direction,
    change: Math.round(change * 100) / 100,
    percentage: Math.round(percentage * 100) / 100
  }
}

/**
 * Calculate percentage
 */
function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 10000) / 100
}

/**
 * Generate insights based on current stats
 */
function generateInsights(stats: any, trends: any): string[] {
  const insights: string[] = []

  // Health score insights
  if (stats.cache_health_score > 80) {
    insights.push('✅ Cache health is excellent. System is performing optimally.')
  } else if (stats.cache_health_score > 60) {
    insights.push('⚠️ Cache health is good but could be improved.')
  } else {
    insights.push('🔴 Cache health needs attention. Consider cleanup or policy adjustments.')
  }

  // Trend insights
  if (trends.health_score.direction === 'up') {
    insights.push('📈 Cache quality is improving over time.')
  } else if (trends.health_score.direction === 'down') {
    insights.push('📉 Cache quality is declining. Investigation recommended.')
  }

  // Hot entries insights
  const hotPercentage = calculatePercentage(stats.hot_count, stats.total_entries)
  if (hotPercentage < 20) {
    insights.push('🔥 Low hot entry percentage. Cache may not be hitting frequently-used queries.')
  } else if (hotPercentage > 50) {
    insights.push('🔥 High hot entry percentage indicates excellent cache utilization.')
  }

  // Cold/stale insights
  const coldStalePercentage = calculatePercentage(
    stats.cold_count + stats.stale_count,
    stats.total_entries
  )
  if (coldStalePercentage > 30) {
    insights.push('❄️ High cold/stale percentage. Consider more aggressive cleanup.')
  }

  // Access patterns
  if (stats.avg_access_count < 2) {
    insights.push('📊 Low average access count suggests poor cache hit rate.')
  } else if (stats.avg_access_count > 10) {
    insights.push('📊 High average access count indicates excellent cache reuse.')
  }

  return insights
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(stats: any, trends: any): string[] {
  const recommendations: string[] = []

  // Health score recommendations
  if (stats.cache_health_score < 50) {
    recommendations.push('Run manual cleanup: DELETE FROM cached_responses WHERE lifecycle IN (\'cold\', \'stale\')')
  }

  // Stale entry recommendations
  if (stats.stale_count > 100) {
    recommendations.push('High stale count detected. Run scan-cache-metadata cron to clean up.')
  }

  // Age recommendations
  if (stats.avg_age_days > 60) {
    recommendations.push('Average age is high. Consider implementing more aggressive TTL policies for dynamic content.')
  }

  // Access pattern recommendations
  if (stats.avg_access_count < 2 && trends.access_count.direction === 'down') {
    recommendations.push('Cache hit rate is declining. Review query patterns and cache key generation.')
  }

  // Trend-based recommendations
  if (trends.health_score.direction === 'down' && Math.abs(trends.health_score.percentage) > 10) {
    recommendations.push('Significant health decline detected. Review recent changes to caching logic or enrichment context.')
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Cache is healthy. Continue monitoring regularly.')
  }

  return recommendations
}
