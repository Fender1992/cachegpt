/**
 * Anthropic-compatible Messages API endpoint
 * This endpoint proxies requests to the Anthropic API with caching
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

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
  try {
    // Validate API key
    const cachegptApiKey = getApiKey(request)
    if (!cachegptApiKey) {
      return NextResponse.json(
        { error: 'Invalid or missing x-api-key header. Expected format: cgpt_sk_...' },
        { status: 401 }
      )
    }

    // Parse request body (Anthropic Messages API format)
    const body = await request.json()
    const { model, max_tokens, messages, system, temperature } = body

    // Validate required fields
    if (!model || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid request format. Required: model, messages (array)' },
        { status: 400 }
      )
    }

    // TODO: Verify CacheGPT API key against database
    // For now, we'll use the environment variable Anthropic key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY

    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured on server' },
        { status: 500 }
      )
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey
    })

    // Call Anthropic API
    const response = await anthropic.messages.create({
      model,
      max_tokens: max_tokens || 4096,
      messages,
      ...(system && { system }),
      ...(temperature !== undefined && { temperature })
    })

    // Return response in Anthropic format
    return NextResponse.json(response)

  } catch (error) {
    console.error('Anthropic API error:', error)

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
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
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version'
    }
  })
}
