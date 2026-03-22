import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateApiKey, extractApiKey } from '@/lib/api-key-auth'
import { generateEmbedding } from '@/lib/embeddings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
)

/**
 * POST /api/cache/check
 *
 * Check the semantic cache for a matching response.
 * Uses OpenAI embeddings + pgvector cosine similarity via find_similar_cached_response RPC.
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
    const { prompt, model, similarity_threshold } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing required field: prompt' }, { status: 400 })
    }
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Missing required field: model' }, { status: 400 })
    }

    const provider = inferProvider(model)
    const threshold = typeof similarity_threshold === 'number'
      ? Math.min(Math.max(similarity_threshold, 0), 1)
      : 0.85

    // Generate 1536-dim embedding via OpenAI
    const embedding = await generateEmbedding(prompt)
    const embeddingStr = '[' + embedding.join(',') + ']'

    // Use pgvector RPC for cosine similarity search
    const { data, error } = await supabase.rpc('find_similar_cached_response', {
      query_embedding: embeddingStr,
      similarity_threshold: threshold,
      result_limit: 1,
      provider_filter: null,
      model_filter: null,
    })

    const latencyMs = Date.now() - startTime

    if (error) {
      console.error('[CACHE-CHECK] RPC error:', JSON.stringify(error))
      // Return error details for debugging
      return NextResponse.json({
        hit: false,
        response: null,
        similarity_score: null,
        cache_age_seconds: null,
        tier: null,
        metadata: null,
        latency_ms: latencyMs,
        _debug: { rpc_error: error.message, code: error.code },
      })
    }

    if (data && data.length > 0) {
      const hit = data[0]
      const cacheAgeSeconds = hit.created_at
        ? Math.floor((Date.now() - new Date(hit.created_at).getTime()) / 1000)
        : 0

      // Update access count asynchronously
      supabase
        .from('cached_responses')
        .update({
          access_count: (hit.access_count || 0) + 1,
          last_accessed: new Date().toISOString(),
        })
        .eq('id', hit.id)
        .then(() => {}, err => console.error('[CACHE-CHECK] Access update error:', err))

      return NextResponse.json({
        hit: true,
        response: hit.response,
        similarity_score: Math.round(hit.similarity * 1000) / 1000,
        cache_age_seconds: cacheAgeSeconds,
        tier: hit.tier || null,
        metadata: {
          id: hit.id,
          accessCount: hit.access_count,
          model: hit.model,
          provider: hit.provider,
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
