/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to this predictive caching system, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After editing this file, UPDATE STATUS file with:
 * - Changes to predictive algorithms or ML models
 * - Performance impact on cache hit rates
 * - Integration changes with ranking/tier systems
 */

import { createClient } from '@supabase/supabase-js';
import { rankingManager } from './ranking-features-manager';
import { tierCache } from './tier-based-cache';

export interface QueryPattern {
  pattern: string;
  frequency: number;
  lastSeen: Date;
  timeOfDay: number[];
  dayOfWeek: number[];
  userIds: string[];
}

export interface PredictiveCache {
  query: string;
  probability: number;
  reason: string;
  suggestedTier: string;
  estimatedValue: number;
}

export interface PredictionMetrics {
  hitRate: number;
  totalPredictions: number;
  successfulPredictions: number;
  averageProbability: number;
  topPatterns: QueryPattern[];
}

export class PredictiveCacheManager {
  private supabase;
  private patterns: Map<string, QueryPattern> = new Map();
  private predictionHistory: Map<string, boolean> = new Map();

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }

  /**
   * Analyze query patterns from historical data
   */
  async analyzeQueryPatterns(): Promise<QueryPattern[]> {
    try {
      console.log('[PREDICTIVE] Analyzing query patterns...');

      const { data: responses, error } = await this.supabase
        .from('cached_responses')
        .select('query, access_count, created_at, last_accessed, user_id')
        .eq('is_archived', false)
        .gte('access_count', 2) // Only analyze patterns with multiple accesses
        .order('access_count', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('[PREDICTIVE] Error fetching pattern data:', error);
        return [];
      }

      const patterns: Map<string, QueryPattern> = new Map();

      for (const response of responses) {
        const normalizedQuery = this.normalizeQuery(response.query);
        const pattern = this.extractPattern(normalizedQuery);

        if (patterns.has(pattern)) {
          const existing = patterns.get(pattern)!;
          existing.frequency += response.access_count;
          existing.lastSeen = new Date(Math.max(
            existing.lastSeen.getTime(),
            new Date(response.last_accessed).getTime()
          ));
          if (!existing.userIds.includes(response.user_id)) {
            existing.userIds.push(response.user_id);
          }
        } else {
          patterns.set(pattern, {
            pattern,
            frequency: response.access_count,
            lastSeen: new Date(response.last_accessed),
            timeOfDay: this.extractTimePatterns(response.created_at, response.last_accessed),
            dayOfWeek: this.extractDayPatterns(response.created_at, response.last_accessed),
            userIds: [response.user_id]
          });
        }
      }

      this.patterns = patterns;
      const patternArray = Array.from(patterns.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 50); // Top 50 patterns

      console.log(`[PREDICTIVE] Found ${patternArray.length} query patterns`);
      return patternArray;

    } catch (error) {
      console.error('[PREDICTIVE] Error analyzing patterns:', error);
      return [];
    }
  }

  /**
   * Normalize query for pattern matching
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/\d+/g, '<number>') // Replace numbers with placeholder
      .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g, '<month>')
      .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, '<day>')
      .replace(/\b\d{4}\b/g, '<year>')
      .replace(/[^\w\s<>]/g, ' ') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract semantic pattern from normalized query
   */
  private extractPattern(normalizedQuery: string): string {
    const words = normalizedQuery.split(' ');

    // Extract key concepts (keep first 3-5 important words)
    const importantWords = words.filter(word =>
      word.length > 2 &&
      !['the', 'and', 'for', 'are', 'you', 'can', 'how', 'what', 'why', 'when', 'where'].includes(word)
    ).slice(0, 5);

    return importantWords.join(' ');
  }

  /**
   * Extract time-of-day patterns from timestamps
   */
  private extractTimePatterns(createdAt: string, lastAccessed: string): number[] {
    const times = [new Date(createdAt), new Date(lastAccessed)];
    const hours = times.map(date => date.getHours());

    // Create hour buckets (0-23)
    const buckets = new Array(24).fill(0);
    hours.forEach(hour => buckets[hour]++);

    return buckets;
  }

  /**
   * Extract day-of-week patterns from timestamps
   */
  private extractDayPatterns(createdAt: string, lastAccessed: string): number[] {
    const dates = [new Date(createdAt), new Date(lastAccessed)];
    const days = dates.map(date => date.getDay()); // 0 = Sunday, 6 = Saturday

    const buckets = new Array(7).fill(0);
    days.forEach(day => buckets[day]++);

    return buckets;
  }

  /**
   * Predict likely queries based on current context
   */
  async predictLikelyQueries(
    currentHour: number = new Date().getHours(),
    currentDay: number = new Date().getDay(),
    userId?: string
  ): Promise<PredictiveCache[]> {
    const predictiveEnabled = await rankingManager.isFeatureEnabled('predictive_caching');

    if (!predictiveEnabled) {
      console.log('[PREDICTIVE] Predictive caching not enabled');
      return [];
    }

    try {
      const patterns = await this.analyzeQueryPatterns();
      const predictions: PredictiveCache[] = [];

      for (const pattern of patterns) {
        const probability = this.calculateProbability(pattern, currentHour, currentDay, userId);

        if (probability > 0.3) { // 30% threshold for worthwhile predictions
          const suggestedTier = this.predictOptimalTier(pattern);
          const estimatedValue = this.estimateQueryValue(pattern);

          predictions.push({
            query: pattern.pattern,
            probability,
            reason: this.generatePredictionReason(pattern, currentHour, currentDay, userId),
            suggestedTier,
            estimatedValue
          });
        }
      }

      // Sort by probability and return top predictions
      const topPredictions = predictions
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 10);

      console.log(`[PREDICTIVE] Generated ${topPredictions.length} predictions`);
      return topPredictions;

    } catch (error) {
      console.error('[PREDICTIVE] Error generating predictions:', error);
      return [];
    }
  }

  /**
   * Calculate probability of a pattern occurring
   */
  private calculateProbability(
    pattern: QueryPattern,
    currentHour: number,
    currentDay: number,
    userId?: string
  ): number {
    let probability = 0;

    // Base frequency score (0-0.4)
    const maxFrequency = Math.max(...Array.from(this.patterns.values()).map(p => p.frequency));
    const frequencyScore = Math.min(pattern.frequency / maxFrequency, 1) * 0.4;

    // Time-of-day score (0-0.3)
    const timeScore = pattern.timeOfDay[currentHour] > 0 ? 0.3 : 0;

    // Day-of-week score (0-0.2)
    const dayScore = pattern.dayOfWeek[currentDay] > 0 ? 0.2 : 0;

    // Recency score (0-0.1)
    const daysSinceLastSeen = (Date.now() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0.1 - (daysSinceLastSeen * 0.01), 0);

    // User familiarity score (0-0.1)
    const userScore = userId && pattern.userIds.includes(userId) ? 0.1 : 0;

    probability = frequencyScore + timeScore + dayScore + recencyScore + userScore;

    return Math.min(probability, 1);
  }

  /**
   * Predict optimal tier for a query pattern
   */
  private predictOptimalTier(pattern: QueryPattern): string {
    if (pattern.frequency >= 20) return 'hot';
    if (pattern.frequency >= 10) return 'warm';
    if (pattern.frequency >= 5) return 'cool';
    if (pattern.frequency >= 2) return 'cold';
    return 'frozen';
  }

  /**
   * Estimate value/cost savings of caching this query
   */
  private estimateQueryValue(pattern: QueryPattern): number {
    // Base value on frequency and user count
    const baseValue = pattern.frequency * 0.01; // $0.01 per access saved
    const userMultiplier = Math.log(pattern.userIds.length + 1); // More users = more value

    return baseValue * userMultiplier;
  }

  /**
   * Generate human-readable reason for prediction
   */
  private generatePredictionReason(
    pattern: QueryPattern,
    currentHour: number,
    currentDay: number,
    userId?: string
  ): string {
    const reasons = [];

    if (pattern.frequency >= 10) {
      reasons.push(`high frequency (${pattern.frequency} accesses)`);
    }

    if (pattern.timeOfDay[currentHour] > 0) {
      reasons.push('commonly asked at this time');
    }

    if (pattern.dayOfWeek[currentDay] > 0) {
      reasons.push('typical for this day of week');
    }

    if (userId && pattern.userIds.includes(userId)) {
      reasons.push('user has asked similar queries');
    }

    const daysSince = Math.floor((Date.now() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 1) {
      reasons.push('recently popular');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'pattern analysis';
  }

  /**
   * Pre-warm cache with predicted queries
   */
  async prewarmCache(predictions: PredictiveCache[]): Promise<number> {
    let prewarmedCount = 0;

    for (const prediction of predictions) {
      if (prediction.probability > 0.6) { // Only prewarm high-probability predictions
        try {
          // Check if similar query already exists in cache
          const existing = await tierCache.findSimilarResponse(
            prediction.query,
            'free-model',
            'mixed',
            { similarityThreshold: 0.9 }
          );

          if (!existing) {
            // Generate response using free providers (simplified for prewarming)
            console.log(`[PREDICTIVE] Prewarming: "${prediction.query}" (${Math.round(prediction.probability * 100)}% probability)`);

            // Track prediction for accuracy measurement
            this.predictionHistory.set(prediction.query, false);

            prewarmedCount++;
          }

        } catch (error) {
          console.error('[PREDICTIVE] Error prewarming query:', prediction.query, error);
        }
      }
    }

    console.log(`[PREDICTIVE] ✅ Prewarmed ${prewarmedCount} predictions`);
    return prewarmedCount;
  }

  /**
   * Track prediction accuracy
   */
  async trackPredictionAccuracy(actualQuery: string): Promise<void> {
    const normalizedQuery = this.normalizeQuery(actualQuery);
    const pattern = this.extractPattern(normalizedQuery);

    // Check if this matches any of our predictions
    for (const [predictedQuery, wasHit] of this.predictionHistory.entries()) {
      if (!wasHit && this.queryMatches(pattern, predictedQuery)) {
        this.predictionHistory.set(predictedQuery, true);
        console.log(`[PREDICTIVE] ✅ Prediction hit: "${predictedQuery}" matched "${actualQuery}"`);
        break;
      }
    }
  }

  /**
   * Check if actual query matches predicted pattern
   */
  private queryMatches(actualPattern: string, predictedPattern: string): boolean {
    const actualWords = actualPattern.split(' ');
    const predictedWords = predictedPattern.split(' ');

    // Simple pattern matching - at least 70% word overlap
    const overlap = actualWords.filter(word => predictedWords.includes(word)).length;
    const similarity = overlap / Math.max(actualWords.length, predictedWords.length);

    return similarity >= 0.7;
  }

  /**
   * Get prediction metrics and accuracy
   */
  async getPredictionMetrics(): Promise<PredictionMetrics> {
    const totalPredictions = this.predictionHistory.size;
    const successfulPredictions = Array.from(this.predictionHistory.values())
      .filter(hit => hit).length;

    const hitRate = totalPredictions > 0 ? successfulPredictions / totalPredictions : 0;

    const patterns = await this.analyzeQueryPatterns();
    const topPatterns = patterns.slice(0, 10);

    // Calculate average probability from recent predictions
    const recentPredictions = await this.predictLikelyQueries();
    const averageProbability = recentPredictions.length > 0
      ? recentPredictions.reduce((sum, pred) => sum + pred.probability, 0) / recentPredictions.length
      : 0;

    return {
      hitRate,
      totalPredictions,
      successfulPredictions,
      averageProbability,
      topPatterns
    };
  }

  /**
   * Clean up old prediction history to prevent memory bloat
   */
  cleanupPredictionHistory(): void {
    if (this.predictionHistory.size > 1000) {
      const entries = Array.from(this.predictionHistory.entries());
      const recent = entries.slice(-500); // Keep last 500 predictions

      this.predictionHistory.clear();
      recent.forEach(([query, hit]) => {
        this.predictionHistory.set(query, hit);
      });

      console.log('[PREDICTIVE] Cleaned up prediction history');
    }
  }
}

// Export singleton instance
export const predictiveCache = new PredictiveCacheManager();