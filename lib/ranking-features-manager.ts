/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to this ranking system, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After editing this file, UPDATE STATUS file with:
 * - Changes to ranking algorithms or feature flags
 * - Performance impact assessments
 * - Integration notes with cache/chat systems
 */

import { createClient } from '@supabase/supabase-js';

export interface RankingFeature {
  feature_name: string;
  is_enabled: boolean;
  config: Record<string, any>;
  updated_at: string;
}

export interface CacheMetrics {
  totalQueries: number;
  averageAccessCount: number;
  oldestQueryDays: number;
  tierDistribution: Record<string, number>;
}

export class RankingFeaturesManager {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }

  /**
   * Get all ranking features and their current state
   */
  async getFeatures(): Promise<RankingFeature[]> {
    const { data, error } = await this.supabase
      .from('ranking_features')
      .select('*')
      .order('feature_name');

    if (error) {
      console.error('[RANKING] Error fetching features:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Check if a specific feature is enabled
   */
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('ranking_features')
      .select('is_enabled')
      .eq('feature_name', featureName)
      .single();

    if (error) {
      console.error(`[RANKING] Error checking feature ${featureName}:`, error);
      return false;
    }

    return data?.is_enabled || false;
  }

  /**
   * Get feature configuration
   */
  async getFeatureConfig(featureName: string): Promise<Record<string, any>> {
    const { data, error } = await this.supabase
      .from('ranking_features')
      .select('config')
      .eq('feature_name', featureName)
      .single();

    if (error) {
      console.error(`[RANKING] Error getting config for ${featureName}:`, error);
      return {};
    }

    return data?.config || {};
  }

  /**
   * Update feature state
   */
  async updateFeature(featureName: string, isEnabled: boolean, config?: Record<string, any>): Promise<boolean> {
    const updateData: any = {
      is_enabled: isEnabled,
      updated_at: new Date().toISOString()
    };

    if (config) {
      updateData.config = config;
    }

    const { error } = await this.supabase
      .from('ranking_features')
      .update(updateData)
      .eq('feature_name', featureName);

    if (error) {
      console.error(`[RANKING] Error updating feature ${featureName}:`, error);
      return false;
    }

    console.log(`[RANKING] ✅ Updated feature ${featureName}: enabled=${isEnabled}`);
    return true;
  }

  /**
   * Get current cache metrics to determine feature readiness
   */
  async getCacheMetrics(): Promise<CacheMetrics> {
    try {
      // Get total queries and metrics
      const { data: statsData, error: statsError } = await this.supabase
        .from('cached_responses')
        .select('access_count, created_at, tier')
        .eq('is_archived', false);

      if (statsError) {
        console.error('[RANKING] Error fetching cache stats:', statsError);
        return {
          totalQueries: 0,
          averageAccessCount: 0,
          oldestQueryDays: 0,
          tierDistribution: {}
        };
      }

      const totalQueries = statsData?.length || 0;
      const averageAccessCount = totalQueries > 0
        ? statsData.reduce((sum, item) => sum + (item.access_count || 0), 0) / totalQueries
        : 0;

      // Calculate oldest query age
      const oldestQuery = statsData?.reduce((oldest, item) => {
        const createdAt = new Date(item.created_at).getTime();
        return createdAt < oldest ? createdAt : oldest;
      }, Date.now());

      const oldestQueryDays = oldestQuery
        ? Math.floor((Date.now() - oldestQuery) / (1000 * 60 * 60 * 24))
        : 0;

      // Calculate tier distribution
      const tierDistribution: Record<string, number> = {};
      statsData?.forEach(item => {
        const tier = item.tier || 'unknown';
        tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
      });

      return {
        totalQueries,
        averageAccessCount,
        oldestQueryDays,
        tierDistribution
      };

    } catch (error) {
      console.error('[RANKING] Error calculating cache metrics:', error);
      return {
        totalQueries: 0,
        averageAccessCount: 0,
        oldestQueryDays: 0,
        tierDistribution: {}
      };
    }
  }

  /**
   * Auto-enable features based on cache size and usage patterns
   */
  async autoEnableFeatures(): Promise<void> {
    try {
      const metrics = await this.getCacheMetrics();
      console.log('[RANKING] Cache metrics:', metrics);

      // Enable metadata collection if we have any queries
      if (metrics.totalQueries > 0) {
        const metadataEnabled = await this.isFeatureEnabled('collect_metadata');
        if (!metadataEnabled) {
          await this.updateFeature('collect_metadata', true, { sample_rate: 0.1 });
          console.log('[RANKING] ✅ Auto-enabled metadata collection');
        }
      }

      // Enable v2 scoring if we have enough queries
      if (metrics.totalQueries >= 10000) {
        const v2Enabled = await this.isFeatureEnabled('use_v2_scoring');
        if (!v2Enabled) {
          await this.updateFeature('use_v2_scoring', true, { min_queries: 10000 });
          console.log('[RANKING] ✅ Auto-enabled v2 scoring system');
        }
      }

      // Enable tier archival for large datasets
      if (metrics.totalQueries >= 50000) {
        const archivalEnabled = await this.isFeatureEnabled('use_tier_archival');
        if (!archivalEnabled) {
          await this.updateFeature('use_tier_archival', true, { enabled_after_queries: 50000 });
          console.log('[RANKING] ✅ Auto-enabled tier archival');
        }
      }

      // Enable predictive caching for very large datasets
      if (metrics.totalQueries >= 100000 && metrics.averageAccessCount >= 2.0) {
        const predictiveEnabled = await this.isFeatureEnabled('predictive_caching');
        if (!predictiveEnabled) {
          await this.updateFeature('predictive_caching', true, { algorithm: 'time_series' });
          console.log('[RANKING] ✅ Auto-enabled predictive caching');
        }
      }

    } catch (error) {
      console.error('[RANKING] Error in auto-enable features:', error);
    }
  }

  /**
   * Calculate popularity score based on current feature settings
   */
  async calculatePopularityScore(
    accessCount: number,
    createdAt: Date,
    lastAccessed: Date,
    costSaved: number,
    qualityScore?: number
  ): Promise<number> {
    const useV2Scoring = await this.isFeatureEnabled('use_v2_scoring');

    let baseScore: number;
    if (useV2Scoring) {
      baseScore = this.calculateV2PopularityScore(accessCount, createdAt, lastAccessed, costSaved);
    } else {
      baseScore = this.calculateV1PopularityScore(accessCount, createdAt, lastAccessed, costSaved);
    }

    // Apply quality score multiplier if available
    if (qualityScore !== undefined && qualityScore !== null) {
      // Quality score is 0-100, convert to 0.5-1.5 multiplier
      // quality_score 0 → 0.5x, quality_score 50 → 1.0x, quality_score 100 → 1.5x
      const qualityMultiplier = 0.5 + (qualityScore / 100);
      baseScore = baseScore * qualityMultiplier;
    }

    return baseScore;
  }

  /**
   * V1 Popularity scoring (basic algorithm)
   */
  private calculateV1PopularityScore(
    accessCount: number,
    createdAt: Date,
    lastAccessed: Date,
    costSaved: number
  ): number {
    const now = Date.now();
    const ageInDays = (now - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceAccess = (now - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

    // Basic scoring: frequency + recency + value
    const frequencyScore = Math.min(accessCount * 10, 50); // Cap at 50
    const recencyScore = Math.max(50 - daysSinceAccess * 2, 0); // Decay over time
    const valueScore = Math.min(costSaved * 1000, 20); // Cost savings bonus

    return Math.max(frequencyScore + recencyScore + valueScore, 0);
  }

  /**
   * V2 Popularity scoring (advanced algorithm with metadata)
   */
  private calculateV2PopularityScore(
    accessCount: number,
    createdAt: Date,
    lastAccessed: Date,
    costSaved: number
  ): number {
    const now = Date.now();
    const ageInDays = (now - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceAccess = (now - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

    // Advanced scoring with decay functions
    const frequencyScore = Math.min(accessCount * 8, 40); // Slightly reduced weight
    const recencyBoost = Math.exp(-daysSinceAccess / 7) * 30; // Exponential decay
    const ageDiscount = Math.max(1 - ageInDays / 365, 0.1); // Age discount factor
    const valueScore = Math.min(costSaved * 1200, 25); // Enhanced value scoring

    const baseScore = (frequencyScore + recencyBoost + valueScore) * ageDiscount;

    // Trending bonus for recently popular items
    const trendingBonus = accessCount > 5 && daysSinceAccess < 1 ? 15 : 0;

    return Math.max(baseScore + trendingBonus, 0);
  }

  /**
   * Assign tier based on popularity score
   */
  assignTier(popularityScore: number): 'hot' | 'warm' | 'cool' | 'cold' | 'frozen' {
    if (popularityScore >= 80) return 'hot';
    if (popularityScore >= 60) return 'warm';
    if (popularityScore >= 40) return 'cool';
    if (popularityScore >= 20) return 'cold';
    return 'frozen';
  }

  /**
   * Update popularity scores for all cached responses
   */
  async updateAllPopularityScores(): Promise<number> {
    try {
      console.log('[RANKING] Starting popularity score update...');

      const { data: responses, error } = await this.supabase
        .from('cached_responses')
        .select('id, access_count, created_at, last_accessed, cost_saved')
        .eq('is_archived', false);

      if (error) {
        console.error('[RANKING] Error fetching responses for scoring:', error);
        return 0;
      }

      let updatedCount = 0;
      const batchSize = 100;

      for (let i = 0; i < responses.length; i += batchSize) {
        const batch = responses.slice(i, i + batchSize);
        const updates = [];

        for (const response of batch) {
          const popularityScore = await this.calculatePopularityScore(
            response.access_count,
            new Date(response.created_at),
            new Date(response.last_accessed),
            response.cost_saved
          );

          const tier = this.assignTier(popularityScore);

          updates.push({
            id: response.id,
            popularity_score: popularityScore,
            tier,
            last_score_update: new Date().toISOString()
          });
        }

        // Batch update
        for (const update of updates) {
          const { error: updateError } = await this.supabase
            .from('cached_responses')
            .update({
              popularity_score: update.popularity_score,
              tier: update.tier,
              last_score_update: update.last_score_update
            })
            .eq('id', update.id);

          if (!updateError) {
            updatedCount++;
          }
        }

        // Log progress every 1000 updates
        if (updatedCount % 1000 === 0) {
          console.log(`[RANKING] Updated ${updatedCount} popularity scores...`);
        }
      }

      console.log(`[RANKING] ✅ Updated ${updatedCount} popularity scores`);
      return updatedCount;

    } catch (error) {
      console.error('[RANKING] Error updating popularity scores:', error);
      return 0;
    }
  }

  /**
   * Get ranking system health check
   */
  async getSystemHealth(): Promise<{
    isHealthy: boolean;
    metrics: CacheMetrics;
    features: RankingFeature[];
    recommendations: string[];
  }> {
    const metrics = await this.getCacheMetrics();
    const features = await this.getFeatures();
    const recommendations: string[] = [];

    // Health checks
    let isHealthy = true;

    if (metrics.totalQueries === 0) {
      isHealthy = false;
      recommendations.push('No cached queries found - system needs data to function');
    }

    if (metrics.totalQueries > 10000 && !await this.isFeatureEnabled('use_v2_scoring')) {
      recommendations.push('Consider enabling v2 scoring for better performance with large datasets');
    }

    if (metrics.totalQueries > 50000 && !await this.isFeatureEnabled('use_tier_archival')) {
      recommendations.push('Enable tier archival to manage large cache efficiently');
    }

    if (Object.keys(metrics.tierDistribution).length === 0) {
      recommendations.push('Run popularity score update to initialize tier distribution');
    }

    return {
      isHealthy,
      metrics,
      features,
      recommendations
    };
  }
}

// Export singleton instance
export const rankingManager = new RankingFeaturesManager();