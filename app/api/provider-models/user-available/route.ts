import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

/**
 * POST /api/provider-models/user-available
 * Get models available to the current authenticated user based on their API keys
 */
export async function POST(request: NextRequest) {
  try {
    // Create Supabase client with user session
    const cookieStore = cookies();
    const supabase = await createClient();

    // Get current authenticated user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      console.log('[USER-AVAILABLE] No session found, returning unauthorized');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log('[USER-AVAILABLE] Fetching models for user:', userId);

    // Check if user has API keys configured (premium access)
    const { data: credentials, error: credError } = await supabase
      .from('user_provider_credentials')
      .select('provider, is_active, status, api_key')
      .eq('user_id', userId)
      .or('status.eq.ready,is_active.eq.true')
      .not('api_key', 'is', null);

    if (credError) {
      console.error('[USER-AVAILABLE] Error fetching credentials:', credError);
    }

    // Filter to only credentials that have an API key
    const activeCredentials = credentials?.filter(c => c.api_key && c.api_key.trim() !== '') || [];
    const hasApiKeys = activeCredentials.length > 0;
    const providersWithKeys = new Set(activeCredentials.map(c => c.provider));

    console.log('[USER-AVAILABLE] User has API keys:', hasApiKeys);
    console.log('[USER-AVAILABLE] Providers with keys:', Array.from(providersWithKeys));

    // Get all active models from the database
    const { data: allModels, error: modelsError } = await supabase
      .from('provider_models')
      .select('*')
      .eq('is_active', true)
      .order('provider')
      .order('cost_per_million_input', { ascending: true });

    if (modelsError) {
      console.error('[USER-AVAILABLE] Error fetching models:', modelsError);
      return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
    }

    console.log('[USER-AVAILABLE] Total models in database:', allModels?.length || 0);

    // Backend free providers (always available, server manages API keys)
    const freeProviders = new Set(['groq', 'openrouter', 'huggingface']);

    // Premium providers (require user's own API keys)
    const premiumProviders = new Set(['claude', 'chatgpt', 'gemini', 'perplexity', 'anthropic', 'openai']);

    // Filter models based on user's access
    const availableModels = allModels?.filter(model => {
      // Backend free models are ALWAYS available (no user API keys needed)
      if (freeProviders.has(model.provider)) {
        return true;
      }

      // Premium providers only show if user has configured API keys for that provider
      if (premiumProviders.has(model.provider) || model.requires_api_key) {
        const hasKey = providersWithKeys.has(model.provider);
        console.log(`[USER-AVAILABLE] Checking ${model.provider}/${model.model_id}: requires_api_key=${model.requires_api_key}, user has key=${hasKey}`);
        return hasKey;
      }

      // Unknown providers default to not available
      return false;
    }) || [];

    console.log('[USER-AVAILABLE] Available models after filtering:', availableModels.length);

    // Group models by provider
    const groupedModels = availableModels.reduce((acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    }, {} as Record<string, any[]>);

    console.log('[USER-AVAILABLE] Grouped providers:', Object.keys(groupedModels));

    return NextResponse.json({
      models: availableModels,
      grouped: groupedModels,
      user_access: {
        user_id: userId,
        has_premium: hasApiKeys,
        providers_with_keys: Array.from(providersWithKeys),
        total_models: availableModels.length
      }
    });
  } catch (error: any) {
    console.error('[USER-AVAILABLE] Error in user available models API:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
