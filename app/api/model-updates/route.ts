import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { modelRegistry } from '@/lib/models/registry';

/**
 * Model Updates API
 *
 * Returns current model configuration for all providers.
 * Sources: 1) provider_models DB table, 2) in-memory registry fallback.
 * Consumed by lib/llm-config.ts for auto-update checks.
 */
export async function GET(request: NextRequest) {
  try {
    // Try database first for the most up-to-date data
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      const { data: models, error } = await supabase
        .from('provider_models')
        .select('*')
        .eq('is_active', true)
        .order('provider')
        .order('is_default', { ascending: false });

      if (!error && models && models.length > 0) {
        // Group by provider
        const providers: Record<string, any> = {};

        // Map DB provider names to display names
        const displayNames: Record<string, string> = {
          chatgpt: 'ChatGPT',
          claude: 'Claude',
          gemini: 'Gemini',
          perplexity: 'Perplexity',
          groq: 'Groq',
          openrouter: 'OpenRouter',
          huggingface: 'HuggingFace',
        };

        for (const model of models) {
          if (!providers[model.provider]) {
            providers[model.provider] = {
              name: displayNames[model.provider] || model.provider,
              models: [],
            };
          }

          providers[model.provider].models.push({
            id: model.model_id,
            name: model.model_name,
            default: model.is_default || false,
            maxTokens: model.max_tokens || model.max_context_tokens || 128000,
            maxOutputTokens: model.max_output_tokens || 4096,
            tier: model.tier || 'balanced',
            supportsStreaming: model.supports_streaming ?? true,
            supportsVision: model.supports_vision ?? false,
          });
        }

        return NextResponse.json({
          providers,
          lastUpdated: new Date().toISOString().split('T')[0],
          updateUrl: 'https://cachegpt.app/api/model-updates',
          autoUpdate: true,
          source: 'database',
        });
      }
    }

    // Fallback: use in-memory registry
    const allModels = modelRegistry.getAllModels();
    const providers: Record<string, any> = {};

    const providerDisplayNames: Record<string, string> = {
      openai: 'ChatGPT',
      anthropic: 'Claude',
      google: 'Gemini',
      perplexity: 'Perplexity',
      groq: 'Groq',
      openrouter: 'OpenRouter',
      huggingface: 'HuggingFace',
      grok: 'Grok',
    };

    for (const model of allModels) {
      const providerKey = model.provider;
      if (!providers[providerKey]) {
        providers[providerKey] = {
          name: providerDisplayNames[providerKey] || providerKey,
          models: [],
        };
      }

      providers[providerKey].models.push({
        id: model.id,
        name: model.name,
        default: model.isDefault,
        maxTokens: model.maxContextTokens,
        maxOutputTokens: model.maxOutputTokens,
        tier: model.tier,
        supportsStreaming: model.supportsStreaming,
        supportsVision: model.supportsVision,
      });
    }

    return NextResponse.json({
      providers,
      lastUpdated: new Date().toISOString().split('T')[0],
      updateUrl: 'https://cachegpt.app/api/model-updates',
      autoUpdate: true,
      source: 'registry',
    });
  } catch (error) {
    console.error('[MODEL-UPDATES] Failed to fetch models:', error);

    // Last resort: return minimal static config
    return NextResponse.json({
      providers: {
        chatgpt: {
          name: 'ChatGPT',
          models: [{ id: 'gpt-4o', name: 'GPT-4o', default: true, maxTokens: 128000 }],
        },
        claude: {
          name: 'Claude',
          models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', default: true, maxTokens: 200000 }],
        },
      },
      lastUpdated: new Date().toISOString().split('T')[0],
      updateUrl: 'https://cachegpt.app/api/model-updates',
      autoUpdate: false,
      source: 'static-fallback',
    });
  }
}
