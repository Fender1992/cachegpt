/**
 * OpenAI-compatible Chat Completions endpoint
 *
 * Accepts OpenAI format, routes through CacheGPT's provider system,
 * returns OpenAI-compatible response format.
 *
 * Auth: Bearer token or x-api-key with cgpt_sk_ prefix
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { resolveProvider, ProviderResolutionError, createProviderErrorResponse } from '@/services/llm/providerResolver'
import { createAdapter } from '@/services/llm/adapters'
import { generateRequestId } from '@/config/llmConfig'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

function getApiKey(request: NextRequest): string | null {
  // Support both x-api-key and Authorization: Bearer
  const xApiKey = request.headers.get('x-api-key')
  if (xApiKey?.startsWith('cgpt_sk_')) return xApiKey

  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer cgpt_sk_')) return auth.slice(7)
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    if (token.startsWith('cgpt_sk_')) return token
  }

  return null
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  let providerResolution: any = undefined

  try {
    const cachegptApiKey = getApiKey(request)
    if (!cachegptApiKey) {
      return NextResponse.json(
        { error: { message: 'Invalid or missing API key. Use x-api-key or Authorization: Bearer cgpt_sk_...', type: 'authentication_error', code: 'invalid_api_key' } },
        { status: 401, headers: { 'x-request-id': requestId } }
      )
    }

    const keyHash = hashApiKey(cachegptApiKey)
    const { data: keyData, error: keyError } = await supabase
      .rpc('validate_cachegpt_api_key', { api_key_hash: keyHash })

    if (keyError || !keyData || keyData.length === 0 || !keyData[0].is_valid) {
      return NextResponse.json(
        { error: { message: 'Invalid or expired API key', type: 'authentication_error', code: 'invalid_api_key' } },
        { status: 401, headers: { 'x-request-id': requestId } }
      )
    }

    const userId = keyData[0].user_id
    supabase.rpc('increment_api_key_usage', { api_key_hash: keyHash })

    const body = await request.json()
    const { model, messages, max_tokens, temperature, stream } = body

    if (!model || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: { message: 'Invalid request. Required: model, messages (array)', type: 'invalid_request_error' } },
        { status: 400, headers: { 'x-request-id': requestId } }
      )
    }

    // Extract system message from OpenAI format (role: "system")
    let systemPrompt: string | undefined
    const chatMessages = messages.filter((m: any) => {
      if (m.role === 'system') {
        systemPrompt = typeof m.content === 'string' ? m.content : m.content?.[0]?.text
        return false
      }
      return true
    })

    try {
      providerResolution = await resolveProvider({
        headers: request.headers,
        requestId,
        endpoint: '/api/v1/chat/completions',
        model,
      })
    } catch (error) {
      if (error instanceof ProviderResolutionError) {
        return NextResponse.json(
          { error: { message: error.message, type: 'server_error' } },
          { status: error.statusCode, headers: { 'x-request-id': requestId } }
        )
      }
      throw error
    }

    const adapter = createAdapter(providerResolution.provider)

    const response = await adapter.chat({
      messages: chatMessages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content?.[0]?.text || '',
      })),
      model,
      maxTokens: max_tokens || 4096,
      systemPrompt,
      temperature,
    })

    // Format as OpenAI chat completions response
    const completionResponse = {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: response.usage?.promptTokens || 0,
        completion_tokens: response.usage?.completionTokens || 0,
        total_tokens: (response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0),
      },
    }

    return NextResponse.json(completionResponse, {
      headers: {
        'x-request-id': requestId,
        'x-llm-provider-used': response.provider,
      },
    })

  } catch (error) {
    console.error('[V1-CHAT-COMPLETIONS] Error:', error)
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : 'Internal server error', type: 'server_error' } },
      { status: 500, headers: { 'x-request-id': requestId } }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    },
  })
}
