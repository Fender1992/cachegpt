/**
 * Cache Lifecycle Management System
 *
 * Provides intelligent cache lifecycle management with metadata-based decisions.
 * Replaces fixed TTL approach with adaptive lifecycle stages based on:
 * - Access patterns (frequency, recency)
 * - Query types (static, dynamic, time-sensitive)
 * - User feedback (helpful, outdated, incorrect)
 * - Context changes (enrichment updates)
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Lifecycle stages
export enum CacheLifecycle {
  HOT = 'hot',       // 0-7 days, frequently accessed
  WARM = 'warm',     // 8-30 days, occasionally accessed
  COOL = 'cool',     // 31-90 days, rarely accessed
  COLD = 'cold',     // 90+ days, seldom accessed
  STALE = 'stale'    // Marked for deletion
}

// Query type classification for intelligent TTL
export enum QueryType {
  GENERAL = 'general',           // Default
  STATIC = 'static',             // Facts, definitions (long TTL)
  DYNAMIC = 'dynamic',           // Code generation, analysis (medium TTL)
  TIME_SENSITIVE = 'time-sensitive', // News, weather, dates (short TTL)
  FACTUAL = 'factual',           // Historical data, documentation (long TTL)
  CREATIVE = 'creative'          // Writing, brainstorming (medium TTL)
}

export interface CacheMetadata {
  lifecycle: CacheLifecycle
  last_accessed: Date
  access_count: number
  query_type: QueryType
  context_hash: string | null
  user_feedback: 'helpful' | 'outdated' | 'incorrect' | null
  feedback_count: number
  quality_score: number
  lifecycle_updated_at: Date
}

export interface LifecycleStats {
  hot_count: number
  warm_count: number
  cool_count: number
  cold_count: number
  stale_count: number
  total_entries: number
  deleted_count: number
  promoted_count: number
  demoted_count: number
  avg_access_count: number
  avg_age_days: number
  cache_health_score: number
}

export class CacheLifecycleManager {
  private supabase

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }

  /**
   * Generate context hash for cache invalidation
   */
  generateContextHash(context: any): string {
    const contextString = JSON.stringify(context, Object.keys(context).sort())
    return crypto.createHash('sha256').update(contextString).digest('hex')
  }

  /**
   * Classify query type based on content
   */
  classifyQueryType(prompt: string): QueryType {
    const lowerPrompt = prompt.toLowerCase()

    // Time-sensitive indicators
    if (
      lowerPrompt.includes('today') ||
      lowerPrompt.includes('now') ||
      lowerPrompt.includes('current') ||
      lowerPrompt.includes('latest') ||
      lowerPrompt.includes('weather') ||
      lowerPrompt.includes('news')
    ) {
      return QueryType.TIME_SENSITIVE
    }

    // Static/factual indicators
    if (
      lowerPrompt.includes('what is') ||
      lowerPrompt.includes('define') ||
      lowerPrompt.includes('explain') ||
      lowerPrompt.includes('who is') ||
      lowerPrompt.includes('history of')
    ) {
      return QueryType.FACTUAL
    }

    // Creative indicators
    if (
      lowerPrompt.includes('write') ||
      lowerPrompt.includes('create') ||
      lowerPrompt.includes('brainstorm') ||
      lowerPrompt.includes('story') ||
      lowerPrompt.includes('poem')
    ) {
      return QueryType.CREATIVE
    }

    // Dynamic/code indicators
    if (
      lowerPrompt.includes('code') ||
      lowerPrompt.includes('function') ||
      lowerPrompt.includes('implement') ||
      lowerPrompt.includes('debug') ||
      lowerPrompt.includes('fix')
    ) {
      return QueryType.DYNAMIC
    }

    return QueryType.GENERAL
  }

  /**
   * Update cache access metadata (call this on cache hit)
   */
  async recordCacheAccess(cacheId: string): Promise<void> {
    await this.supabase.rpc('increment', {
      row_id: cacheId,
      table_name: 'cached_responses',
      column_name: 'access_count'
    })

    await this.supabase
      .from('cached_responses')
      .update({
        last_accessed: new Date().toISOString()
      })
      .eq('id', cacheId)
  }

  /**
   * Record user feedback on cache entry
   */
  async recordUserFeedback(
    cacheId: string,
    userId: string | null,
    feedbackType: 'helpful' | 'outdated' | 'incorrect',
    comment?: string
  ): Promise<void> {
    // Insert feedback
    await this.supabase
      .from('cache_feedback')
      .insert({
        cached_response_id: cacheId,
        user_id: userId,
        feedback_type: feedbackType,
        comment: comment || null
      })

    // Update aggregated feedback on cache entry
    const { data: feedbackCounts } = await this.supabase
      .from('cache_feedback')
      .select('feedback_type')
      .eq('cached_response_id', cacheId)

    if (feedbackCounts) {
      const total = feedbackCounts.length
      const outdatedCount = feedbackCounts.filter(f => f.feedback_type === 'outdated').length
      const incorrectCount = feedbackCounts.filter(f => f.feedback_type === 'incorrect').length

      // Mark as stale if majority negative
      const negativeRatio = (outdatedCount + incorrectCount) / total
      const userFeedback = negativeRatio > 0.5 ? 'outdated' : 'helpful'

      await this.supabase
        .from('cached_responses')
        .update({
          user_feedback: userFeedback,
          feedback_count: total
        })
        .eq('id', cacheId)
    }
  }

  /**
   * Scan cache entries and update lifecycle stages
   */
  async scanAndUpdateLifecycles(batchSize: number = 1000): Promise<LifecycleStats> {
    const stats: LifecycleStats = {
      hot_count: 0,
      warm_count: 0,
      cool_count: 0,
      cold_count: 0,
      stale_count: 0,
      total_entries: 0,
      deleted_count: 0,
      promoted_count: 0,
      demoted_count: 0,
      avg_access_count: 0,
      avg_age_days: 0,
      cache_health_score: 0
    }

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: entries, error } = await this.supabase
        .from('cached_responses')
        .select('*')
        .order('created_at', { ascending: true })
        .range(offset, offset + batchSize - 1)

      if (error || !entries || entries.length === 0) {
        hasMore = false
        break
      }

      for (const entry of entries) {
        stats.total_entries++

        const ageDays = this.calculateAgeDays(entry.created_at)
        const daysSinceAccess = this.calculateAgeDays(entry.last_accessed || entry.created_at)

        // Calculate new lifecycle
        const { data: newLifecycle } = await this.supabase.rpc('determine_cache_lifecycle', {
          age_days: ageDays,
          days_since_access: daysSinceAccess,
          access_cnt: entry.access_count || 0,
          query_typ: entry.query_type || 'general',
          feedback: entry.user_feedback
        })

        const oldLifecycle = entry.lifecycle

        // Count lifecycle changes
        if (newLifecycle !== oldLifecycle) {
          const lifecycleOrder = ['hot', 'warm', 'cool', 'cold', 'stale']
          const oldIndex = lifecycleOrder.indexOf(oldLifecycle)
          const newIndex = lifecycleOrder.indexOf(newLifecycle)

          if (newIndex < oldIndex) {
            stats.promoted_count++
          } else if (newIndex > oldIndex) {
            stats.demoted_count++
          }
        }

        // Delete stale entries
        if (newLifecycle === CacheLifecycle.STALE) {
          await this.supabase
            .from('cached_responses')
            .delete()
            .eq('id', entry.id)
          stats.deleted_count++
          stats.stale_count++
        } else {
          // Update lifecycle
          await this.supabase
            .from('cached_responses')
            .update({
              lifecycle: newLifecycle,
              lifecycle_updated_at: new Date().toISOString()
            })
            .eq('id', entry.id)

          // Count by lifecycle
          switch (newLifecycle) {
            case CacheLifecycle.HOT:
              stats.hot_count++
              break
            case CacheLifecycle.WARM:
              stats.warm_count++
              break
            case CacheLifecycle.COOL:
              stats.cool_count++
              break
            case CacheLifecycle.COLD:
              stats.cold_count++
              break
          }
        }

        stats.avg_access_count += entry.access_count || 0
        stats.avg_age_days += ageDays
      }

      offset += batchSize
      hasMore = entries.length === batchSize
    }

    // Calculate averages
    if (stats.total_entries > 0) {
      stats.avg_access_count = stats.avg_access_count / stats.total_entries
      stats.avg_age_days = stats.avg_age_days / stats.total_entries

      // Calculate health score using database function
      const { data: healthScore } = await this.supabase.rpc('calculate_cache_health_score', {
        hot_cnt: stats.hot_count,
        warm_cnt: stats.warm_count,
        cool_cnt: stats.cool_count,
        cold_cnt: stats.cold_count,
        stale_cnt: stats.stale_count,
        total: stats.total_entries
      })

      stats.cache_health_score = healthScore || 0
    }

    // Save stats to database
    await this.supabase
      .from('cache_lifecycle_stats')
      .upsert({
        scan_date: new Date().toISOString().split('T')[0],
        ...stats
      }, {
        onConflict: 'scan_date'
      })

    return stats
  }

  /**
   * Get lifecycle-aware cache entries (excludes stale and cold by default)
   */
  async findCacheEntry(
    model: string,
    promptHash: string,
    excludeLifecycles: CacheLifecycle[] = [CacheLifecycle.STALE, CacheLifecycle.COLD]
  ): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('cached_responses')
      .select('*')
      .eq('model', model)
      .eq('normalized_prompt_hash', promptHash)
      .not('lifecycle', 'in', `(${excludeLifecycles.join(',')})`)
      .order('access_count', { ascending: false })
      .maybeSingle()

    if (error) {
      console.error('[CACHE-LIFECYCLE] Error finding cache entry:', error)
      return null
    }

    return data
  }

  /**
   * Invalidate cache entries with specific context hash
   */
  async invalidateByContextHash(contextHash: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('cached_responses')
      .update({ lifecycle: CacheLifecycle.STALE })
      .eq('context_hash', contextHash)
      .select('id')

    if (error) {
      console.error('[CACHE-LIFECYCLE] Error invalidating by context:', error)
      return 0
    }

    return data?.length || 0
  }

  /**
   * Get cache health dashboard data
   */
  async getCacheHealthStats(days: number = 30): Promise<LifecycleStats[]> {
    const { data, error } = await this.supabase
      .from('cache_lifecycle_stats')
      .select('*')
      .gte('scan_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('scan_date', { ascending: false })

    if (error) {
      console.error('[CACHE-LIFECYCLE] Error fetching stats:', error)
      return []
    }

    return data || []
  }

  /**
   * Helper: Calculate age in days
   */
  private calculateAgeDays(timestamp: string): number {
    const now = new Date()
    const then = new Date(timestamp)
    return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
  }
}

// Export singleton instance
export const cacheLifecycleManager = new CacheLifecycleManager()
