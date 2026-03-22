import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, extractApiKey } from '@/lib/api-key-auth'
import { TierBasedCache } from '@/lib/tier-based-cache'

const tierCache = new TierBasedCache()

/**
 * POST /api/cache/put
 *
 * Store a new response in the semantic cache.
 * Used by the OpenClaw CacheGPT skill and external integrations.
 *
 * Auth: Bearer cgpt_sk_... or x-api-key header
 *
 * Body: {
 *   prompt: string,
 *   response: string,
 *   model: string,
 *   ttl_seconds?: number (default 3600),
 *   prompt_hash?: string (optional, for logging)
 * }
 *
 * Returns: {
 *   stored: boolean,
 *   id?: string,
 *   tier?: string
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
    const { prompt, response, model, ttl_seconds } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 }
      )
    }

    if (!response || typeof response !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: response' },
        { status: 400 }
      )
    }

    if (!model || typeof model !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: model' },
        { status: 400 }
      )
    }

    // Don't cache empty or very short responses
    if (response.trim().length < 5) {
      return NextResponse.json(
        { error: 'Response too short to cache (minimum 5 characters)' },
        { status: 400 }
      )
    }

    // Infer provider from model name
    const provider = inferProvider(model)

    // Store in cache
    const responseId = await tierCache.storeResponse(
      prompt,
      response,
      model,
      provider,
      session.user.id,
      Date.now() - startTime
    )

    const latencyMs = Date.now() - startTime

    if (responseId) {
      return NextResponse.json({
        stored: true,
        id: responseId,
        latency_ms: latencyMs,
      }, { status: 201 })
    }

    return NextResponse.json({
      stored: false,
      error: 'Failed to store response in cache',
      latency_ms: latencyMs,
    }, { status: 500 })

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
