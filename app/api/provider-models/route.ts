import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET /api/provider-models - Get available models for each provider
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')
    const freeOnly = searchParams.get('free_only') === 'true'

    // Create Supabase client (public read access to provider models)
    const supabase = createRouteHandlerClient({ cookies })

    // Build query
    let query = supabase
      .from('provider_models')
      .select('*')
      .eq('is_active', true)
      .order('provider')
      .order('cost_per_million_input', { ascending: true })

    // Filter by provider if specified
    if (provider) {
      query = query.eq('provider', provider)
    }

    // Filter by free models only if specified
    if (freeOnly) {
      query = query.eq('is_free', true)
    }

    const { data: models, error } = await query

    if (error) {
      console.error('Error fetching provider models:', error)
      return NextResponse.json({ error: 'Failed to fetch provider models' }, { status: 500 })
    }

    // Group models by provider for easier frontend consumption
    const groupedModels = models?.reduce((acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = []
      }
      acc[model.provider].push(model)
      return acc
    }, {} as Record<string, any[]>)

    return NextResponse.json({
      models: models || [],
      grouped: groupedModels || {},
      filters: {
        provider,
        free_only: freeOnly
      }
    })
  } catch (error) {
    console.error('Error in provider models API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/provider-models/user-available - Get models available to the current user
export async function POST(request: NextRequest) {
  try {
    // Create Supabase client with user session
    const supabase = createRouteHandlerClient({ cookies })

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 })
    }

    const userId = session.user.id

    // Check if user has API keys configured (premium access)
    const { data: credentials, error: credError } = await supabase
      .from('user_provider_credentials')
      .select('provider, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('api_key_encrypted', 'is', null)

    const hasApiKeys = credentials && credentials.length > 0
    const providersWithKeys = new Set(credentials?.map(c => c.provider) || [])

    // Get all models
    const { data: allModels, error: modelsError } = await supabase
      .from('provider_models')
      .select('*')
      .eq('is_active', true)
      .order('provider')
      .order('cost_per_million_input', { ascending: true })

    if (modelsError) {
      console.error('Error fetching models for user:', userId, modelsError)
      return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
    }

    // Backend free providers (always available)
    const freeProviders = new Set(['groq', 'openrouter', 'huggingface'])

    // Premium providers (require user API keys)
    const premiumProviders = new Set(['claude', 'chatgpt', 'gemini', 'perplexity'])

    // Filter models based on user's access
    const availableModels = allModels?.filter(model => {
      // Backend free models are ALWAYS available (no API keys needed)
      if (freeProviders.has(model.provider)) {
        return true
      }

      // Premium providers only show if user has API keys
      if (premiumProviders.has(model.provider)) {
        return providersWithKeys.has(model.provider)
      }

      return false
    })

    // Group models by provider
    const groupedModels = availableModels?.reduce((acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = []
      }
      acc[model.provider].push(model)
      return acc
    }, {} as Record<string, any[]>)

    return NextResponse.json({
      models: availableModels || [],
      grouped: groupedModels || {},
      user_access: {
        user_id: userId,
        has_premium: hasApiKeys,
        providers_with_keys: Array.from(providersWithKeys)
      }
    })
  } catch (error) {
    console.error('Error in user available models API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}