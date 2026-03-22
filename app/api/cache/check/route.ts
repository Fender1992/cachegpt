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
 * Uses OpenAI embeddings + direct pgvector cosine distance query.
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

    const threshold = typeof similarity_threshold === 'number'
      ? Math.min(Math.max(similarity_threshold, 0), 1)
      : 0.85

    // Generate 1536-dim embedding via OpenAI
    const embedding = await generateEmbedding(prompt)
    const embeddingStr = '[' + embedding.join(',') + ']'

    // Direct pgvector cosine similarity query (bypasses RPC type mismatch)
    const { data, error } = await supabase
      .from('cached_responses')
      .select('id, query, response, model, provider, access_count, created_at, tier, embedding')
      .eq('is_archived', false)
      .not('embedding', 'is', null)
      .limit(50)

    const latencyMs = Date.now() - startTime

    if (error) {
      console.error('[CACHE-CHECK] Query error:', error)
      return NextResponse.json({
        hit: false,
        response: null,
        similarity_score: null,
        cache_age_seconds: null,
        tier: null,
        metadata: null,
        latency_ms: latencyMs,
      })
    }

    // Calculate cosine similarity in-app for matching candidates
    let bestMatch: any = null
    let bestSimilarity = 0

    if (data) {
      for (const row of data) {
        if (!row.embedding) continue

        // Parse the pgvector string to array
        let candidateEmbedding: number[]
        try {
          if (typeof row.embedding === 'string') {
            candidateEmbedding = JSON.parse(row.embedding)
          } else if (Array.isArray(row.embedding)) {
            candidateEmbedding = row.embedding
          } else {
            continue
          }
        } catch {
          continue
        }

        // Skip dimension mismatch
        if (candidateEmbedding.length !== embedding.length) continue

        const similarity = cosineSimilarity(embedding, candidateEmbedding)

        if (similarity >= threshold && similarity > bestSimilarity) {
          bestMatch = row
          bestSimilarity = similarity
        }
      }
    }

    if (bestMatch) {
      const cacheAgeSeconds = bestMatch.created_at
        ? Math.floor((Date.now() - new Date(bestMatch.created_at).getTime()) / 1000)
        : 0

      // Update access count asynchronously
      supabase
        .from('cached_responses')
        .update({
          access_count: (bestMatch.access_count || 0) + 1,
          last_accessed: new Date().toISOString(),
        })
        .eq('id', bestMatch.id)
        .then(() => {}, err => console.error('[CACHE-CHECK] Access update error:', err))

      return NextResponse.json({
        hit: true,
        response: bestMatch.response,
        similarity_score: Math.round(bestSimilarity * 1000) / 1000,
        cache_age_seconds: cacheAgeSeconds,
        tier: bestMatch.tier || null,
        metadata: {
          id: bestMatch.id,
          accessCount: bestMatch.access_count,
          model: bestMatch.model,
          provider: bestMatch.provider,
        },
        latency_ms: Date.now() - startTime,
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
      latency_ms: Date.now() - startTime,
    })

  } catch (error) {
    console.error('[CACHE-CHECK] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    )
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
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
