/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to ranking/caching logic, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * This system affects chat performance and costs. After making changes:
 * - Update STATUS file with performance impact analysis
 * - Document any database schema changes
 * - Note changes to cache hit rates or cost savings
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Intelligent caching system with ranking-based optimization
 * Integrates with the progressive ranking system for chat speed optimization
 */

interface CachedResponse {
  id: string;
  query: string;
  response: string;
  model: string;
  provider: string;
  embedding: number[];
  access_count: number;
  popularity_score: number;
  tier: string;
  cost_saved: number;
  created_at: string;
  last_accessed: string;
}

interface SimilarityMatch {
  cached_response: CachedResponse;
  similarity: number;
  time_saved_ms: number;
  cost_saved: number;
}

/**
 * Generate embedding for query text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Use OpenAI embeddings if available in server environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Fallback to simple text-based embedding
      return generateSimpleEmbedding(text);
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.slice(0, 8000) // Limit input size
      })
    });

    if (!response.ok) {
      return generateSimpleEmbedding(text);
    }

    const data = await response.json();
    // Ada-002 returns 1536 dimensions, take first 384 for our DB
    const fullEmbedding = data.data[0].embedding;
    return fullEmbedding.slice(0, 384);

  } catch (error) {
    console.error('Embedding generation failed:', error);
    return generateSimpleEmbedding(text);
  }
}

/**
 * Simple fallback embedding generation
 */
function generateSimpleEmbedding(text: string): number[] {
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
 * Find similar cached responses using ranking-optimized search
 */
export async function findSimilarCachedResponse(
  query: string,
  model: string,
  provider: string,
  threshold: number = 0.85
): Promise<SimilarityMatch | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar cached responses with ranking optimization
    // Use tier-based search for performance - search hot/warm tiers first
    const searchTiers = ['hot', 'warm', 'cool', 'cold'];

    for (const tier of searchTiers) {
      const { data: candidates, error } = await supabase
        .from('cached_responses')
        .select('*')
        .eq('model', model)
        .eq('provider', provider)
        .eq('tier', tier)
        .eq('is_archived', false)
        .gte('popularity_score', tier === 'hot' ? 80 : tier === 'warm' ? 60 : 20)
        .order('popularity_score', { ascending: false })
        .limit(tier === 'hot' ? 100 : tier === 'warm' ? 50 : 20);

      if (error) {
        console.error(`Error searching ${tier} tier:`, error);
        continue;
      }

      if (!candidates || candidates.length === 0) continue;

      // Calculate similarities for this tier
      for (const candidate of candidates) {
        const similarity = calculateCosineSimilarity(queryEmbedding, candidate.embedding);

        if (similarity >= threshold) {
          // Found a match! Update access stats and return
          await updateCacheAccess(candidate.id, supabase);

          return {
            cached_response: candidate as CachedResponse,
            similarity,
            time_saved_ms: estimateTimeSaved(model, provider),
            cost_saved: estimateCostSaved(model, provider, candidate.response.length)
          };
        }
      }

      // If we found matches in hot/warm tiers, don't search lower tiers
      if (tier === 'warm' && candidates.length > 0) break;
    }

    return null;
  } catch (error) {
    console.error('Cache search failed:', error);
    return null;
  }
}

/**
 * Cache a new response with ranking integration
 */
export async function cacheResponse(
  query: string,
  response: string,
  model: string,
  provider: string,
  userId: string,
  responseTimeMs: number = 0
): Promise<void> {
  try {
    console.log(`[CACHE] Attempting to store response - model: ${model}, provider: ${provider}, userId: ${userId}`);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[CACHE] ERROR: NEXT_PUBLIC_SUPABASE_URL is not set');
      return;
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      console.error('[CACHE] ERROR: SUPABASE_SERVICE_KEY is not set');
      return;
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Generate embedding and initial ranking data
    console.log('[CACHE] Generating embedding...');
    const embedding = await generateEmbedding(query);
    console.log(`[CACHE] Embedding generated, length: ${embedding.length}`);

    const queryHash = crypto.createHash('sha256').update(query + model + provider).digest('hex');
    const initialScore = calculateInitialPopularityScore();
    const tier = assignTier(initialScore);

    // Insert into cache with ranking data
    const insertData = {
        query_hash: queryHash,
        query,
        response,
        model,
        provider,
        embedding,
        user_id: userId,
        access_count: 1,
        popularity_score: initialScore,
        ranking_version: 1, // Start with V1 scoring
        tier,
        cost_saved: estimateCostSaved(model, provider, response.length),
        is_archived: false,
        ranking_metadata: {
          initial_response_time: responseTimeMs,
          created_by_user: userId,
          initial_tier: tier
        },
        created_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_score_update: new Date().toISOString()
    };

    console.log('[CACHE] Insert data prepared, query length:', query.length, 'response length:', response.length);

    const { error } = await supabase
      .from('cached_responses')
      .insert(insertData);

    if (error) {
      console.error('[CACHE] DATABASE INSERT FAILED:', {
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      console.error('[CACHE] Full error object:', error);
    } else {
      console.log(`[CACHE] ✅ Successfully stored response in ${tier} tier (score: ${initialScore}, hash: ${queryHash.substring(0, 8)}...)`);
    }
  } catch (error) {
    console.error('Cache storage failed:', error);
  }
}

/**
 * Update cache access statistics and popularity score
 */
async function updateCacheAccess(cacheId: string, supabase: any): Promise<void> {
  try {
    // Update access count and last accessed time
    await supabase
      .from('cached_responses')
      .update({
        access_count: supabase.sql`access_count + 1`,
        last_accessed: new Date().toISOString()
      })
      .eq('id', cacheId);

    // Update popularity score using the ranking system function
    await supabase.rpc('calculate_and_update_popularity_score', { p_cached_response_id: cacheId });

    console.log(`[CACHE] Updated access stats for ${cacheId}`);
  } catch (error) {
    console.error('Failed to update cache access:', error);
  }
}

/**
 * Calculate cosine similarity between embeddings
 */
function calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
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
 * Calculate initial popularity score for new queries
 */
function calculateInitialPopularityScore(): number {
  // Start with a moderate score that will adjust based on usage
  return 50.0;
}

/**
 * Assign tier based on popularity score
 */
function assignTier(score: number): string {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 40) return 'cool';
  if (score >= 20) return 'cold';
  return 'frozen';
}

/**
 * Estimate time saved by cache hit
 */
function estimateTimeSaved(model: string, provider: string): number {
  // Estimate response time based on model/provider
  const baseTimes = {
    'gpt-5': 3000,
    'claude-opus-4-1-20250805': 2500,
    'gemini-2.0-ultra': 2000,
    'pplx-pro-online': 1500
  };

  return baseTimes[model as keyof typeof baseTimes] || 2000;
}

/**
 * Estimate cost saved by cache hit
 */
function estimateCostSaved(model: string, provider: string, responseLength: number): number {
  // Rough cost estimates per 1K tokens
  const costPer1K = {
    'gpt-5': 0.03,
    'claude-opus-4-1-20250805': 0.015,
    'gemini-2.0-ultra': 0.001,
    'pplx-pro-online': 0.02
  };

  const tokens = Math.ceil(responseLength / 4); // Rough token estimate
  const cost = (costPer1K[model as keyof typeof costPer1K] || 0.01) * (tokens / 1000);
  return Math.round(cost * 100) / 100; // Round to cents
}

/**
 * Get cache statistics for monitoring
 */
export async function getCacheStats(): Promise<any> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data, error } = await supabase
      .from('ranking_dashboard')
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return null;
  }
}