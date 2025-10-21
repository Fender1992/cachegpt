/**
 * Anthropic-compatible Messages API endpoint
 * This endpoint validates CacheGPT API keys and uses the user's stored Anthropic API key
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

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
  try {
    // Validate API key
    const cachegptApiKey = getApiKey(request)
    if (!cachegptApiKey) {
      return NextResponse.json(
        { error: 'Invalid or missing x-api-key header. Expected format: cgpt_sk_...' },
        { status: 401 }
      )
    }

    // Hash the API key to look it up in the database
    const keyHash = hashApiKey(cachegptApiKey)

    // Validate CacheGPT API key against database
    const { data: keyData, error: keyError } = await supabase
      .rpc('validate_cachegpt_api_key', { api_key_hash: keyHash })
      .single()

    if (keyError || !keyData || !keyData.is_valid) {
      return NextResponse.json(
        { error: 'Invalid or expired API key' },
        { status: 401 }
      )
    }

    const userId = keyData.user_id

    // Increment usage count
    await supabase.rpc('increment_api_key_usage', { api_key_hash: keyHash })

    // Get user's Anthropic API key
    const { data: userApiKey, error: apiKeyError } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', userId)
      .eq('provider', 'claude')
      .eq('is_active', true)
      .single()

    if (apiKeyError || !userApiKey) {
      return NextResponse.json(
        { error: 'No active Claude API key found for this user. Please add your Anthropic API key in your CacheGPT settings.' },
        { status: 403 }
      )
    }

    // Decode the base64-encoded API key
    const anthropicApiKey = Buffer.from(userApiKey.api_key_encrypted, 'base64').toString('utf-8')

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

    // Initialize Anthropic client with user's API key
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
