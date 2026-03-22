import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateApiKey, extractApiKey } from '@/lib/api-key-auth'
import { generateEmbedding } from '@/lib/embeddings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
)

/**
 * POST /api/cache/put
 *
 * Store a new response in the semantic cache.
 * Uses OpenAI text-embedding-3-small (1536 dims) for proper pgvector storage.
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
    const { prompt, response, model } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing required field: prompt' }, { status: 400 })
    }
    if (!response || typeof response !== 'string') {
      return NextResponse.json({ error: 'Missing required field: response' }, { status: 400 })
    }
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Missing required field: model' }, { status: 400 })
    }
    if (response.trim().length < 5) {
      return NextResponse.json({ error: 'Response too short to cache' }, { status: 400 })
    }

    const provider = inferProvider(model)

    // Generate 1536-dim embedding via OpenAI
    const embedding = await generateEmbedding(prompt)
    const embeddingStr = '[' + embedding.join(',') + ']'

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('cached_responses')
      .insert({
        query: prompt,
        response,
        model,
        provider,
        embedding: embeddingStr,
        user_id: session.user.id,
        access_count: 1,
        popularity_score: 50,
        tier: 'cool',
        cost_saved: 0.01,
        is_archived: false,
        created_at: now,
        last_accessed: now,
        last_score_update: now,
      })
      .select('id')
      .single()

    const latencyMs = Date.now() - startTime

    if (error) {
      console.error('[CACHE-PUT] Insert error:', error)
      return NextResponse.json({
        stored: false,
        error: 'Failed to store response',
        details: error.message,
        latency_ms: latencyMs,
      }, { status: 500 })
    }

    return NextResponse.json({
      stored: true,
      id: data.id,
      latency_ms: latencyMs,
    }, { status: 201 })

  } catch (error) {
    console.error('[CACHE-PUT] Error:', error)
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
