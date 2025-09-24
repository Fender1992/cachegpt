import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getDefaultModel } from '@/lib/llm-config'

// Server-side provider credentials (from environment variables)
const PROVIDER_CREDENTIALS = {
  chatgpt: process.env.OPENAI_API_KEY,
  claude: process.env.ANTHROPIC_API_KEY,
  gemini: process.env.GOOGLE_AI_API_KEY,
  perplexity: process.env.PERPLEXITY_API_KEY
}

// Check if enterprise mode is enabled
const ENTERPRISE_MODE = process.env.FEATURE_ENTERPRISE_USER_KEYS === 'true'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { message, provider, model, messages } = body

    // Validate provider
    if (!provider || !['chatgpt', 'claude', 'gemini', 'perplexity'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Get API key
    let apiKey = PROVIDER_CREDENTIALS[provider as keyof typeof PROVIDER_CREDENTIALS]

    // In enterprise mode, check if user has their own API key
    if (ENTERPRISE_MODE) {
      const { data: userCreds } = await supabase
        .from('user_provider_credentials')
        .select('api_key')
        .eq('user_id', session.user.id)
        .eq('provider', provider)
        .single()

      if (userCreds?.api_key) {
        // Decode base64 encoded key
        apiKey = Buffer.from(userCreds.api_key, 'base64').toString('utf8')
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${provider}. Please contact support.` },
        { status: 500 }
      )
    }

    // Call the appropriate provider API
    let response = ''

    switch (provider) {
      case 'chatgpt':
        response = await callOpenAI(apiKey, messages, model || await getDefaultModel('chatgpt'))
        break
      case 'claude':
        response = await callAnthropic(apiKey, messages, model || await getDefaultModel('claude'))
        break
      case 'gemini':
        response = await callGemini(apiKey, messages, model || await getDefaultModel('gemini'))
        break
      case 'perplexity':
        response = await callPerplexity(apiKey, messages, model || await getDefaultModel('perplexity'))
        break
    }

    // Log usage for analytics (optional)
    await supabase.from('usage').insert({
      user_id: session.user.id,
      endpoint: '/api/chat',
      method: 'POST',
      model: model || provider,
      metadata: {
        provider,
        message_count: messages.length,
        response_length: response.length
      }
    })

    return NextResponse.json({ response })

  } catch (error: any) {
    console.error('Chat API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// Provider-specific API calls
async function callOpenAI(apiKey: string, messages: any[], model: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || 'No response'
}

async function callAnthropic(apiKey: string, messages: any[], model: string): Promise<string> {
  // Convert messages to Anthropic format
  const anthropicMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: anthropicMessages,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${error}`)
  }

  const data = await response.json()
  return data.content[0]?.text || 'No response'
}

async function callGemini(apiKey: string, messages: any[], model: string): Promise<string> {
  // Convert messages to Gemini format
  const contents = messages.map(m => ({
    parts: [{ text: m.content }],
    role: m.role === 'user' ? 'user' : 'model'
  }))

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents
      })
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  const data = await response.json()
  return data.candidates[0]?.content?.parts[0]?.text || 'No response'
}

async function callPerplexity(apiKey: string, messages: any[], model: string): Promise<string> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Perplexity API error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || 'No response'
}