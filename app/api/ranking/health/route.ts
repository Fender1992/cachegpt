/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to this ranking health API, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After editing this file, UPDATE STATUS file with:
 * - Changes to health monitoring or metrics
 * - New performance indicators or alerts
 * - Integration changes with ranking system
 */

import { NextRequest, NextResponse } from 'next/server';

// Lazy load to avoid build-time initialization
const getRankingManager = async () => {
  const { rankingManager } = await import('@/lib/ranking-features-manager');
  return rankingManager;
};

const getTierCache = async () => {
  const { tierCache } = await import('@/lib/tier-based-cache');
  return tierCache;
};

const getPredictiveCache = async () => {
  const { predictiveCache } = await import('@/lib/predictive-cache');
  return predictiveCache;
};

/**
 * GET /api/ranking/health - Get ranking system health status
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[RANKING-HEALTH] Checking system health...');

    const manager = await getRankingManager();
    const tierCacheInstance = await getTierCache();
    const predictiveCacheInstance = await getPredictiveCache();

    // Get comprehensive health check
    const health = await manager.getSystemHealth();

    // Get additional metrics
    const [tierStats, predictionMetrics] = await Promise.all([
      tierCacheInstance.getTierStatistics(),
      predictiveCacheInstance.getPredictionMetrics()
    ]);

    const response = {
      status: health.isHealthy ? 'healthy' : 'warning',
      timestamp: new Date().toISOString(),
      metrics: health.metrics,
      features: health.features,
      recommendations: health.recommendations,
      tierStatistics: tierStats,
      predictionMetrics,
      summary: {
        totalQueries: health.metrics.totalQueries,
        averageAccess: Math.round(health.metrics.averageAccessCount * 10) / 10,
        oldestQueryDays: health.metrics.oldestQueryDays,
        enabledFeatures: health.features.filter(f => f.is_enabled).length,
        totalFeatures: health.features.length,
        predictionHitRate: Math.round(predictionMetrics.hitRate * 100),
        hotTierQueries: tierStats.hot?.count || 0,
        warmTierQueries: tierStats.warm?.count || 0
      }
    };

    console.log('[RANKING-HEALTH] Health check completed:', response.status);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[RANKING-HEALTH] Error:', error);

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message || 'Health check failed',
      summary: {
        totalQueries: 0,
        averageAccess: 0,
        oldestQueryDays: 0,
        enabledFeatures: 0,
        totalFeatures: 0,
        predictionHitRate: 0,
        hotTierQueries: 0,
        warmTierQueries: 0
      }
    }, { status: 500 });
  }
}

/**
 * POST /api/ranking/health - Trigger maintenance operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    console.log(`[RANKING-HEALTH] Executing maintenance action: ${action}`);

    let result: any = {};

    const manager = await getRankingManager();
    const tierCacheInstance = await getTierCache();

    switch (action) {
      case 'rebalance':
        await tierCacheInstance.rebalanceTiers();
        result = { message: 'Tier rebalancing completed' };
        break;

      case 'auto-enable':
        await manager.autoEnableFeatures();
        result = { message: 'Auto-feature enablement completed' };
        break;

      case 'archive':
        const archivedCount = await tierCacheInstance.archiveOldResponses();
        result = { message: `Archived ${archivedCount} old responses` };
        break;

      case 'predict':
        const predictiveCachePredict = await getPredictiveCache();
        const predictions = await predictiveCachePredict.predictLikelyQueries();
        const prewarmedCount = await predictiveCachePredict.prewarmCache(predictions);
        result = {
          message: `Generated ${predictions.length} predictions, prewarmed ${prewarmedCount} queries`,
          predictions: predictions.slice(0, 5) // Return top 5 predictions
        };
        break;

      case 'cleanup':
        const predictiveCacheCleanup = await getPredictiveCache();
        predictiveCacheCleanup.cleanupPredictionHistory();
        result = { message: 'Prediction history cleaned up' };
        break;

      default:
        return NextResponse.json({
          error: 'Invalid action',
          availableActions: ['rebalance', 'auto-enable', 'archive', 'predict', 'cleanup']
        }, { status: 400 });
    }

    console.log(`[RANKING-HEALTH] Action ${action} completed:`, result);

    return NextResponse.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      result
    });

  } catch (error: any) {
    console.error('[RANKING-HEALTH] Maintenance error:', error);

    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message || 'Maintenance operation failed'
    }, { status: 500 });
  }
}