import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { discoverAllModels } from '@/lib/models/discovery';
import { modelRegistry } from '@/lib/models/registry';
import { LLM_CONFIG } from '@/config/llmConfig';

/**
 * Cron job endpoint for automatic model updates.
 * Called daily via Vercel cron jobs.
 * Queries each provider's model list API and updates the provider_models table.
 */
export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.VERCEL) {
    // Vercel Cron jobs are internal and trusted
  } else if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } else if (!cronSecret && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Collect API keys for discovery
    const apiKeys: Record<string, string> = {};
    if (LLM_CONFIG.premium.openai.apiKey) apiKeys.openai = LLM_CONFIG.premium.openai.apiKey;
    if (LLM_CONFIG.premium.anthropic.apiKey) apiKeys.anthropic = LLM_CONFIG.premium.anthropic.apiKey;
    if (LLM_CONFIG.premium.google.apiKey) apiKeys.google = LLM_CONFIG.premium.google.apiKey;
    if (LLM_CONFIG.premium.perplexity.apiKey) apiKeys.perplexity = LLM_CONFIG.premium.perplexity.apiKey;
    if (LLM_CONFIG.free.groq.apiKey) apiKeys.groq = LLM_CONFIG.free.groq.apiKey;
    if (LLM_CONFIG.free.openrouter.apiKey) apiKeys.openrouter = LLM_CONFIG.free.openrouter.apiKey;
    if (LLM_CONFIG.free.huggingface.apiKey) apiKeys.huggingface = LLM_CONFIG.free.huggingface.apiKey;

    // Discover models from all providers in parallel
    const discovered = await discoverAllModels(apiKeys);

    const changes: string[] = [];
    let totalModelsUpdated = 0;

    // Update provider_models table if Supabase is configured
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Map provider names to DB convention
      const providerNameMap: Record<string, string> = {
        openai: 'chatgpt',
        anthropic: 'claude',
        google: 'gemini',
        perplexity: 'perplexity',
        groq: 'groq',
        openrouter: 'openrouter',
        huggingface: 'huggingface',
      };

      for (const [provider, models] of Object.entries(discovered)) {
        if (models.length === 0) continue;

        const dbProvider = providerNameMap[provider] || provider;

        for (const model of models) {
          const { error } = await supabase
            .from('provider_models')
            .upsert({
              provider: dbProvider,
              model_id: model.id,
              model_name: model.name,
              is_free: provider === 'groq' || provider === 'openrouter' || provider === 'huggingface',
              requires_api_key: provider !== 'groq' && provider !== 'openrouter' && provider !== 'huggingface',
              max_tokens: model.contextWindow || 128000,
              max_context_tokens: model.contextWindow || 128000,
              max_output_tokens: model.maxOutputTokens || 4096,
              cost_per_million_input: model.pricing?.inputPerMillion || 0,
              cost_per_million_output: model.pricing?.outputPerMillion || 0,
              supports_streaming: model.supportsStreaming,
              supports_vision: model.supportsVision,
              is_active: true,
              last_verified: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'provider,model_id',
            });

          if (error) {
            console.error(`[CRON] Failed to upsert ${provider}/${model.id}:`, error.message);
          } else {
            totalModelsUpdated++;
          }
        }

        changes.push(`${provider}: ${models.length} models`);
      }
    }

    // Update in-memory registry with discovered models
    const registryModels = Object.values(discovered).flat().map(m => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      tier: 'balanced' as const,
      maxContextTokens: m.contextWindow || 128000,
      maxOutputTokens: m.maxOutputTokens || 4096,
      supportsStreaming: m.supportsStreaming,
      supportsVision: m.supportsVision,
      supportsFunctions: false,
      isDefault: false,
      isActive: true,
      lastVerified: new Date().toISOString(),
    }));

    if (registryModels.length > 0) {
      modelRegistry.updateModels(registryModels);
    }

    return NextResponse.json({
      success: true,
      message: 'Model discovery completed',
      providersUpdated: Object.keys(discovered).length,
      totalModelsDiscovered: Object.values(discovered).reduce((sum, m) => sum + m.length, 0),
      totalModelsUpdatedInDB: totalModelsUpdated,
      changes,
    });
  } catch (error: any) {
    console.error('[CRON] Model update failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update models',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
