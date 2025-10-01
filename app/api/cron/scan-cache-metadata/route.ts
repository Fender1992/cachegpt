import { NextRequest, NextResponse } from 'next/server'
import { cacheLifecycleManager } from '@/lib/cache-lifecycle'

/**
 * Cron Job: Scan Cache Metadata and Update Lifecycles
 *
 * Schedule: Daily (recommended)
 * Purpose: Automatically maintain cache health by:
 * - Scanning all cache entries
 * - Updating lifecycle stages based on metadata
 * - Deleting stale entries
 * - Recording health metrics
 *
 * Vercel Cron Configuration:
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/scan-cache-metadata",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      )
    }

    // Allow both Bearer token and direct secret
    const providedSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader

    if (providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Perform metadata scan
    const stats = await cacheLifecycleManager.scanAndUpdateLifecycles()

    const duration = Date.now() - startTime

    // Calculate next scan time (24 hours from now)
    const nextScan = new Date(Date.now() + 24 * 60 * 60 * 1000)

    return NextResponse.json({
      success: true,
      scan_completed_at: new Date().toISOString(),
      duration_ms: duration,
      statistics: {
        total_scanned: stats.total_entries,
        lifecycle_distribution: {
          hot: stats.hot_count,
          warm: stats.warm_count,
          cool: stats.cool_count,
          cold: stats.cold_count,
          stale: stats.stale_count
        },
        actions: {
          deleted: stats.deleted_count,
          promoted: stats.promoted_count,
          demoted: stats.demoted_count
        },
        metrics: {
          avg_access_count: Math.round(stats.avg_access_count * 100) / 100,
          avg_age_days: Math.round(stats.avg_age_days * 100) / 100,
          cache_health_score: Math.round(stats.cache_health_score * 100) / 100
        }
      },
      next_scan: nextScan.toISOString(),
      recommendations: generateRecommendations(stats)
    })

  } catch (error) {
    console.error('[CRON] Cache metadata scan error:', error)
    return NextResponse.json({
      success: false,
      error: 'Cache metadata scan failed',
      details: (error as Error).message
    }, { status: 500 })
  }
}

/**
 * Generate recommendations based on scan results
 */
function generateRecommendations(stats: any): string[] {
  const recommendations: string[] = []

  // Health score recommendations
  if (stats.cache_health_score < 50) {
    recommendations.push('⚠️ Cache health is low. Consider clearing cold entries or adjusting TTL settings.')
  } else if (stats.cache_health_score > 80) {
    recommendations.push('✅ Cache health is excellent. System is performing well.')
  }

  // Stale entry recommendations
  if (stats.stale_count > stats.total_entries * 0.1) {
    recommendations.push(`🗑️ High stale count (${stats.stale_count}). Consider investigating user feedback patterns.`)
  }

  // Cold entry recommendations
  if (stats.cold_count > stats.total_entries * 0.3) {
    recommendations.push(`❄️ Many cold entries (${stats.cold_count}). Consider more aggressive cleanup policies.`)
  }

  // Access pattern recommendations
  if (stats.avg_access_count < 2) {
    recommendations.push('📊 Low average access count. Cache may not be hitting frequently-used queries.')
  }

  // Age recommendations
  if (stats.avg_age_days > 60) {
    recommendations.push('⏰ High average age. Consider shorter TTLs for dynamic content.')
  }

  // Promotion/demotion balance
  const transitionRatio = stats.promoted_count / (stats.demoted_count || 1)
  if (transitionRatio > 2) {
    recommendations.push('📈 More promotions than demotions. Cache is becoming more valuable over time.')
  } else if (transitionRatio < 0.5) {
    recommendations.push('📉 More demotions than promotions. Cache quality may be declining.')
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ All metrics within normal ranges.')
  }

  return recommendations
}
