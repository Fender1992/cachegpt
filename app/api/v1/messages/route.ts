/**
 * LLM Messages API endpoint (provider-agnostic)
 *
 * This endpoint validates CacheGPT API keys and routes to the appropriate LLM provider.
 * Default: Internal LLM (NOT Anthropic)
 *
 * Compatible with Anthropic Messages API format, but can use any provider.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { resolveProvider, ProviderResolutionError, createProviderErrorResponse } from '@/services/llm/providerResolver'
import { createAdapter } from '@/services/llm/adapters'
import { generateRequestId } from '@/config/llmConfig'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Validate and hash API key
function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

// Validate API key from headers
function getApiKey(request: NextRequest): string | null {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return null
  }

  // Validate CacheGPT API key format
  if (!apiKey.startsWith('cgpt_sk_')) {
    return null
  }

  return apiKey
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  let providerResolution: any = undefined // Declare outside try block for error handler access

  try {
    // Validate API key
    const cachegptApiKey = getApiKey(request)
    if (!cachegptApiKey) {
      return NextResponse.json(
        {
          error: 'Invalid or missing x-api-key header. Expected format: cgpt_sk_...',
          requestId,
        },
        {
          status: 401,
          headers: {
            'x-request-id': requestId,
            'x-llm-provider-intent': 'none',
            'x-llm-provider-used': 'none',
          },
        }
      )
    }

    // Hash the API key to look it up in the database
    const keyHash = hashApiKey(cachegptApiKey)

    // Validate CacheGPT API key against database
    const { data: keyData, error: keyError } = await supabase
      .rpc('validate_cachegpt_api_key', { api_key_hash: keyHash })

    if (keyError || !keyData || keyData.length === 0 || !keyData[0].is_valid) {
      return NextResponse.json(
        {
          error: 'Invalid or expired API key',
          requestId,
        },
        {
          status: 401,
          headers: {
            'x-request-id': requestId,
            'x-llm-provider-intent': 'none',
            'x-llm-provider-used': 'none',
          },
        }
      )
    }

    const userId = keyData[0].user_id

    // Increment usage count (fire and forget - don't await)
    supabase.rpc('increment_api_key_usage', { api_key_hash: keyHash })

    // Parse request body (Anthropic Messages API format)
    const body = await request.json()
    const { model, max_tokens, messages, system, temperature } = body

    // Validate required fields
    if (!model || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        {
          error: 'Invalid request format. Required: model, messages (array)',
          requestId,
        },
        {
          status: 400,
          headers: {
            'x-request-id': requestId,
            'x-llm-provider-intent': 'none',
            'x-llm-provider-used': 'none',
          },
        }
      )
    }

    // Resolve which provider to use (model-aware routing)
    try {
      providerResolution = await resolveProvider({
        headers: request.headers,
        requestId,
        endpoint: '/api/v1/messages',
        model,
      })
    } catch (error) {
      if (error instanceof ProviderResolutionError) {
        return NextResponse.json(
          createProviderErrorResponse(error),
          {
            status: error.statusCode,
            headers: {
              'x-request-id': requestId,
              'x-llm-provider-intent': 'auto',
              'x-llm-provider-used': 'none',
            },
          }
        )
      }
      throw error
    }

    // Create adapter for the selected provider
    const adapter = createAdapter(providerResolution.provider)

    const chatParams = {
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      model,
      maxTokens: max_tokens,
      systemPrompt: system,
      temperature,
    }

    // Streaming response (Anthropic SSE format)
    if (body.stream && adapter.chatStream) {
      const encoder = new TextEncoder()
      const msgId = `msg_${requestId}`

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // message_start
            controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
              type: 'message_start',
              message: { id: msgId, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }
            })}\n\n`))

            // content_block_start
            controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
              type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' }
            })}\n\n`))

            let outputTokens = 0
            let inputTokens = 0

            for await (const chunk of adapter.chatStream!(chatParams)) {
              if (chunk.done) {
                if (chunk.usage) {
                  outputTokens = chunk.usage.completionTokens || 0
                  inputTokens = chunk.usage.promptTokens || 0
                }
              } else if (chunk.content) {
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk.content }
                })}\n\n`))
              }
            }

            // content_block_stop
            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({
              type: 'content_block_stop', index: 0
            })}\n\n`))

            // message_delta
            controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({
              type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens }
            })}\n\n`))

            // message_stop
            controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`))
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Stream error'
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'server_error', message: errorMsg } })}\n\n`))
          } finally {
            controller.close()
          }
        },
      })

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'x-request-id': requestId,
        },
      })
    }

    // Non-streaming response
    const response = await adapter.chat(chatParams)

    const anthropicResponse = {
      id: `msg_${requestId}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: response.content,
        },
      ],
      model: response.model || model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: response.usage ? {
        input_tokens: response.usage.promptTokens || 0,
        output_tokens: response.usage.completionTokens || 0,
      } : {
        input_tokens: 0,
        output_tokens: 0,
      },
    }

    return NextResponse.json(anthropicResponse, {
      headers: {
        'x-request-id': requestId,
        'x-llm-provider-intent': providerResolution.provider,
        'x-llm-provider-used': response.provider,
      },
    })

  } catch (error) {
    console.error('[V1-MESSAGES] Error:', error)

    // Determine provider intent and used values for error response
    const providerIntent = providerResolution?.provider || 'auto'
    const providerUsed = 'none' // Error occurred, no provider was successfully used

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: error.message,
          requestId,
        },
        {
          status: 500,
          headers: {
            'x-request-id': requestId,
            'x-llm-provider-intent': providerIntent,
            'x-llm-provider-used': providerUsed,
          },
        }
      )
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        requestId,
      },
      {
        status: 500,
        headers: {
          'x-request-id': requestId,
          'x-llm-provider-intent': providerIntent,
          'x-llm-provider-used': providerUsed,
        },
      }
    )
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-llm-provider, anthropic-version',
    },
  })
}
