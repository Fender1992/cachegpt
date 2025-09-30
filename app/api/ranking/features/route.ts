/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to this ranking features API, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After editing this file, UPDATE STATUS file with:
 * - Changes to feature management or configuration
 * - New feature flags or ranking algorithms
 * - Integration changes with ranking system
 */

import { NextRequest, NextResponse } from 'next/server';

// Lazy load to avoid build-time initialization
const getRankingManager = async () => {
  const { rankingManager } = await import('@/lib/ranking-features-manager');
  return rankingManager;
};

/**
 * GET /api/ranking/features - Get all ranking features and their status
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[RANKING-FEATURES] Fetching feature status...');

    const manager = await getRankingManager();
    const features = await manager.getFeatures();
    const metrics = await manager.getCacheMetrics();

    const response = {
      features,
      metrics,
      recommendations: {
        canEnableV2Scoring: metrics.totalQueries >= 10000,
        canEnableTierArchival: metrics.totalQueries >= 50000,
        canEnablePredictive: metrics.totalQueries >= 100000 && metrics.averageAccessCount >= 2.0,
        shouldEnableMetadata: metrics.totalQueries > 0
      },
      summary: {
        totalFeatures: features.length,
        enabledFeatures: features.filter(f => f.is_enabled).length,
        totalQueries: metrics.totalQueries,
        readyForAdvanced: metrics.totalQueries >= 10000
      }
    };

    console.log('[RANKING-FEATURES] Retrieved features:', response.summary);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[RANKING-FEATURES] Error:', error);

    return NextResponse.json({
      error: error.message || 'Failed to fetch features'
    }, { status: 500 });
  }
}

/**
 * PUT /api/ranking/features/:name - Update a specific feature
 */
export async function PUT(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const featureName = url.pathname.split('/').pop();

    if (!featureName) {
      return NextResponse.json({
        error: 'Feature name is required'
      }, { status: 400 });
    }

    const body = await request.json();
    const { isEnabled, config } = body;

    if (typeof isEnabled !== 'boolean') {
      return NextResponse.json({
        error: 'isEnabled must be a boolean'
      }, { status: 400 });
    }

    console.log(`[RANKING-FEATURES] Updating feature ${featureName}: enabled=${isEnabled}`);

    const manager = await getRankingManager();
    const success = await manager.updateFeature(featureName, isEnabled, config);

    if (!success) {
      return NextResponse.json({
        error: 'Failed to update feature'
      }, { status: 500 });
    }

    // Get updated feature status
    const features = await manager.getFeatures();
    const updatedFeature = features.find(f => f.feature_name === featureName);

    return NextResponse.json({
      success: true,
      feature: updatedFeature,
      message: `Feature ${featureName} ${isEnabled ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error: any) {
    console.error('[RANKING-FEATURES] Update error:', error);

    return NextResponse.json({
      error: error.message || 'Failed to update feature'
    }, { status: 500 });
  }
}

/**
 * POST /api/ranking/features/auto-enable - Auto-enable features based on cache size
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[RANKING-FEATURES] Auto-enabling features...');

    const manager = await getRankingManager();
    await manager.autoEnableFeatures();

    // Get updated feature status
    const features = await manager.getFeatures();
    const metrics = await manager.getCacheMetrics();

    return NextResponse.json({
      success: true,
      message: 'Auto-enable completed',
      features: features.filter(f => f.is_enabled),
      metrics
    });

  } catch (error: any) {
    console.error('[RANKING-FEATURES] Auto-enable error:', error);

    return NextResponse.json({
      error: error.message || 'Auto-enable failed'
    }, { status: 500 });
  }
}