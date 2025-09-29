/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to this tier-based caching system, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After editing this file, UPDATE STATUS file with:
 * - Changes to caching algorithms or tier strategies
 * - Performance optimizations or database impacts
 * - Integration changes with chat/ranking systems
 */

import { createClient } from '@supabase/supabase-js';
import { rankingManager } from './ranking-features-manager';

export interface CachedResponse {
  id: string;
  query: string;
  response: string;
  model: string;
  provider: string;
  embedding: number[];
  popularity_score: number;
  tier: 'hot' | 'warm' | 'cool' | 'cold' | 'frozen';
  access_count: number;
  cost_saved: number;
  created_at: string;
  last_accessed: string;
  is_archived: boolean;
}

export interface CacheSearchOptions {
  similarityThreshold: number;
  maxResults: number;
  tierPriority: string[];
  includeArchived: boolean;
}

export interface CacheHit {
  response: string;
  similarity: number;
  tier: string;
  cached: true;
  metadata: {
    id: string;
    accessCount: number;
    popularityScore: number;
    lastAccessed: string;
  };
}

export class TierBasedCache {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }

  /**
   * Generate simple embedding for text similarity
   */
  private generateEmbedding(text: string): number[] {
    const embedding = new Array(384).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        embedding[(i * 10 + j) % 384] += (charCode / 255) - 0.5;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Search for cached responses with tier-based prioritization
   */
  async findSimilarResponse(
    query: string,
    model: string,
    provider: string,
    options: Partial<CacheSearchOptions> = {}
  ): Promise<CacheHit | null> {
    const defaultOptions: CacheSearchOptions = {
      similarityThreshold: 0.85,
      maxResults: 50,
      tierPriority: ['hot', 'warm', 'cool', 'cold', 'frozen'],
      includeArchived: false,
      ...options
    };

    try {
      const queryEmbedding = this.generateEmbedding(query);
      console.log(`[TIER-CACHE] Searching: model=${model}, provider=${provider}, query="${query.substring(0, 50)}..."`);

      // Search tier by tier for maximum performance
      for (const tier of defaultOptions.tierPriority) {
        const candidates = await this.getCandidatesFromTier(
          tier,
          model,
          provider,
          defaultOptions.maxResults / defaultOptions.tierPriority.length,
          defaultOptions.includeArchived
        );

        if (candidates.length === 0) continue;

        console.log(`[TIER-CACHE] Checking ${candidates.length} candidates in ${tier} tier`);

        // Find best match in this tier
        const match = await this.findBestMatch(
          queryEmbedding,
          candidates,
          defaultOptions.similarityThreshold
        );

        if (match) {
          console.log(`[TIER-CACHE] ✅ Found match in ${tier} tier with ${Math.round(match.similarity * 100)}% similarity`);

          // Update access statistics
          await this.updateAccessStats(match.metadata.id);

          return match;
        }
      }

      console.log('[TIER-CACHE] No matches found across all tiers');
      return null;

    } catch (error) {
      console.error('[TIER-CACHE] Search error:', error);
      return null;
    }
  }

  /**
   * Get candidates from a specific tier
   */
  private async getCandidatesFromTier(
    tier: string,
    model: string,
    provider: string,
    limit: number,
    includeArchived: boolean
  ): Promise<CachedResponse[]> {
    // Debug: Log what we're searching for
    console.log(`[TIER-CACHE-DEBUG] Searching tier=${tier}, model=${model}, provider=${provider}`);

    let query = this.supabase
      .from('cached_responses')
      .select('*')
      .eq('tier', tier);

    // For free tier, don't filter by model/provider to allow broader cache hits
    if (model !== 'free-model' && provider !== 'mixed') {
      query = query.eq('model', model).eq('provider', provider);
    }

    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }

    const { data, error } = await query
      .order('popularity_score', { ascending: false })
      .limit(Math.ceil(limit));

    if (error) {
      console.error(`[TIER-CACHE] Error fetching ${tier} tier:`, error);
      console.error(`[TIER-CACHE] Full error details:`, JSON.stringify(error));
      return [];
    }

    console.log(`[TIER-CACHE-DEBUG] Found ${data?.length || 0} candidates in ${tier} tier`);
    return data || [];
  }

  /**
   * Find best match among candidates
   */
  private async findBestMatch(
    queryEmbedding: number[],
    candidates: CachedResponse[],
    threshold: number
  ): Promise<CacheHit | null> {
    let bestMatch: CachedResponse | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      if (!candidate.embedding) continue;

      const similarity = this.calculateSimilarity(queryEmbedding, candidate.embedding);

      if (similarity >= threshold && similarity > bestSimilarity) {
        bestMatch = candidate;
        bestSimilarity = similarity;
      }
    }

    if (!bestMatch) return null;

    return {
      response: bestMatch.response,
      similarity: bestSimilarity,
      tier: bestMatch.tier,
      cached: true,
      metadata: {
        id: bestMatch.id,
        accessCount: bestMatch.access_count,
        popularityScore: bestMatch.popularity_score,
        lastAccessed: bestMatch.last_accessed
      }
    };
  }

  /**
   * Update access statistics and potentially promote tier
   */
  private async updateAccessStats(responseId: string): Promise<void> {
    try {
      // Get current response data
      const { data: current, error: fetchError } = await this.supabase
        .from('cached_responses')
        .select('access_count, popularity_score, tier, created_at, cost_saved')
        .eq('id', responseId)
        .single();

      if (fetchError || !current) {
        console.error('[TIER-CACHE] Error fetching current data:', fetchError);
        return;
      }

      const newAccessCount = current.access_count + 1;
      const now = new Date();

      // Recalculate popularity score
      const newPopularityScore = await rankingManager.calculatePopularityScore(
        newAccessCount,
        new Date(current.created_at),
        now,
        current.cost_saved
      );

      const newTier = rankingManager.assignTier(newPopularityScore);

      // Update database
      const { error: updateError } = await this.supabase
        .from('cached_responses')
        .update({
          access_count: newAccessCount,
          popularity_score: newPopularityScore,
          tier: newTier,
          last_accessed: now.toISOString(),
          last_score_update: now.toISOString()
        })
        .eq('id', responseId);

      if (updateError) {
        console.error('[TIER-CACHE] Error updating access stats:', updateError);
      } else {
        if (newTier !== current.tier) {
          console.log(`[TIER-CACHE] ✨ Promoted response from ${current.tier} to ${newTier} tier`);
        }
      }

    } catch (error) {
      console.error('[TIER-CACHE] Error in updateAccessStats:', error);
    }
  }

  /**
   * Store new response in cache with automatic tier assignment
   */
  async storeResponse(
    query: string,
    response: string,
    model: string,
    provider: string,
    userId: string | null,
    responseTimeMs: number
  ): Promise<string | null> {
    try {
      const embedding = this.generateEmbedding(query);
      const now = new Date();

      // Initial popularity score (new items start in 'cool' tier)
      const initialScore = await rankingManager.calculatePopularityScore(
        1, // access_count
        now, // created_at
        now, // last_accessed
        0.01 // estimated cost_saved
      );

      const tier = rankingManager.assignTier(initialScore);

      console.log(`[TIER-CACHE] Storing in ${tier} tier: model=${model}, provider=${provider}, user=${userId}`);

      const insertData = {
        query,
        response,
        model,
        provider,
        embedding,
        user_id: userId,
        access_count: 1,
        popularity_score: initialScore,
        ranking_version: 1,
        tier,
        cost_saved: 0.01, // Estimate based on provider
        is_archived: false,
        ranking_metadata: {
          initial_response_time: responseTimeMs,
          created_by_user: userId,
          initial_tier: tier
        },
        created_at: now.toISOString(),
        last_accessed: now.toISOString(),
        last_score_update: now.toISOString()
      };

      const { data, error } = await this.supabase
        .from('cached_responses')
        .insert(insertData)
        .select('id')
        .single();

      if (error) {
        console.error('[TIER-CACHE] Store error:', error);
        console.error('[TIER-CACHE] Insert data that failed:', JSON.stringify(insertData, null, 2));
        console.error('[TIER-CACHE] Full error details:', JSON.stringify(error));
        return null;
      }

      console.log(`[TIER-CACHE] ✅ Stored response with ID: ${data.id} in ${tier} tier`);
      return data.id;

    } catch (error) {
      console.error('[TIER-CACHE] Store error:', error);
      return null;
    }
  }

  /**
   * Get cache statistics by tier
   */
  async getTierStatistics(): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.supabase
        .from('cached_responses')
        .select('tier, access_count, popularity_score, cost_saved, is_archived')
        .eq('is_archived', false);

      if (error) {
        console.error('[TIER-CACHE] Error fetching statistics:', error);
        return {};
      }

      const stats: Record<string, any> = {};
      const tiers = ['hot', 'warm', 'cool', 'cold', 'frozen'];

      for (const tier of tiers) {
        const tierData = data.filter(item => item.tier === tier);
        stats[tier] = {
          count: tierData.length,
          totalAccesses: tierData.reduce((sum, item) => sum + item.access_count, 0),
          avgPopularityScore: tierData.length > 0
            ? tierData.reduce((sum, item) => sum + item.popularity_score, 0) / tierData.length
            : 0,
          totalCostSaved: tierData.reduce((sum, item) => sum + item.cost_saved, 0)
        };
      }

      return stats;

    } catch (error) {
      console.error('[TIER-CACHE] Error calculating statistics:', error);
      return {};
    }
  }

  /**
   * Archive old responses based on tier and age
   */
  async archiveOldResponses(): Promise<number> {
    const archivalEnabled = await rankingManager.isFeatureEnabled('use_tier_archival');

    if (!archivalEnabled) {
      console.log('[TIER-CACHE] Archival not enabled');
      return 0;
    }

    try {
      // Archive frozen tier items older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await this.supabase
        .from('cached_responses')
        .update({ is_archived: true })
        .eq('tier', 'frozen')
        .eq('is_archived', false)
        .lt('last_accessed', thirtyDaysAgo.toISOString())
        .select('id');

      if (error) {
        console.error('[TIER-CACHE] Archival error:', error);
        return 0;
      }

      const archivedCount = data?.length || 0;
      console.log(`[TIER-CACHE] ✅ Archived ${archivedCount} old responses`);

      return archivedCount;

    } catch (error) {
      console.error('[TIER-CACHE] Archival error:', error);
      return 0;
    }
  }

  /**
   * Rebalance tiers by updating popularity scores
   */
  async rebalanceTiers(): Promise<void> {
    console.log('[TIER-CACHE] Starting tier rebalancing...');

    try {
      const updatedCount = await rankingManager.updateAllPopularityScores();
      console.log(`[TIER-CACHE] ✅ Rebalanced ${updatedCount} responses across tiers`);

      // Auto-enable features based on current cache size
      await rankingManager.autoEnableFeatures();

    } catch (error) {
      console.error('[TIER-CACHE] Rebalancing error:', error);
    }
  }
}

// Export singleton instance
export const tierCache = new TierBasedCache();