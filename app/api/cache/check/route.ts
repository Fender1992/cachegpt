import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, extractApiKey } from '@/lib/api-key-auth'
import { TierBasedCache } from '@/lib/tier-based-cache'

const tierCache = new TierBasedCache()

/**
 * POST /api/cache/check
 *
 * Check the semantic cache for a matching response.
 * Used by the OpenClaw CacheGPT skill and external integrations.
 *
 * Auth: Bearer cgpt_sk_... or x-api-key header
 *
 * Body: {
 *   prompt: string,
 *   model: string,
 *   similarity_threshold?: number (default 0.85),
 *   prompt_hash?: string (optional, for logging)
 * }
 *
 * Returns: {
 *   hit: boolean,
 *   response?: string,
 *   similarity_score?: number,
 *   cache_age_seconds?: number,
 *   tier?: string,
 *   metadata?: { id, accessCount, popularityScore }
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Authenticate via API key
    const apiKey = extractApiKey(request.headers.get('authorization'))
      || request.headers.get('x-api-key')

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key. Use Authorization: Bearer cgpt_sk_... or x-api-key header.' },
        { status: 401 }
      )
    }

    const session = await validateApiKey(apiKey)
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired API key.' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { prompt, model, similarity_threshold, prompt_hash } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 }
      )
    }

    if (!model || typeof model !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: model' },
        { status: 400 }
      )
    }

    // Infer provider from model name
    const provider = inferProvider(model)

    // Search the cache
    const threshold = typeof similarity_threshold === 'number'
      ? Math.min(Math.max(similarity_threshold, 0), 1)
      : 0.85

    const result = await tierCache.findSimilarResponse(prompt, model, provider, {
      similarityThreshold: threshold,
    })

    const latencyMs = Date.now() - startTime

    if (result) {
      // Cache HIT
      const cacheAgeSeconds = result.metadata.lastAccessed
        ? Math.floor((Date.now() - new Date(result.metadata.lastAccessed).getTime()) / 1000)
        : 0

      return NextResponse.json({
        hit: true,
        response: result.response,
        similarity_score: Math.round(result.similarity * 1000) / 1000,
        cache_age_seconds: cacheAgeSeconds,
        tier: result.tier,
        metadata: {
          id: result.metadata.id,
          accessCount: result.metadata.accessCount,
          popularityScore: result.metadata.popularityScore,
        },
        latency_ms: latencyMs,
      })
    }

    // Cache MISS
    return NextResponse.json({
      hit: false,
      response: null,
      similarity_score: null,
      cache_age_seconds: null,
      tier: null,
      metadata: null,
      latency_ms: latencyMs,
    })

  } catch (error) {
    console.error('[CACHE-CHECK] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    )
  }
}

function inferProvider(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('claude')) return 'anthropic'
  if (m.includes('gpt')) return 'openai'
  if (m.includes('gemini')) return 'google'
  if (m.includes('llama') || m.includes('mixtral')) return 'groq'
  if (m.includes('sonar') || m.includes('perplexity')) return 'perplexity'
  return 'openai'
}
