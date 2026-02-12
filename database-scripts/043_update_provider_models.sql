-- =====================================================
-- Migration 043: Update Provider Models & Cache Access RPC
-- =====================================================
-- Purpose: Update provider_models table with new capability columns,
--          refresh model catalog to current 2025 models, and add
--          atomic cache access increment function.
-- Date: February 12, 2026
--
-- Changes:
-- 1. Add tier, context/output token limits, capability flags,
--    default marker, and timestamp columns to provider_models
-- 2. Upsert current models for all supported providers
-- 3. Create increment_cache_access RPC for atomic cache hit tracking
-- =====================================================

-- =====================================================
-- 1. ADD NEW COLUMNS TO provider_models
-- =====================================================

ALTER TABLE public.provider_models
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'balanced' CHECK (tier IN ('fast', 'balanced', 'premium')),
ADD COLUMN IF NOT EXISTS max_context_tokens INTEGER DEFAULT 128000,
ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER DEFAULT 4096,
ADD COLUMN IF NOT EXISTS supports_streaming BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS supports_vision BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS supports_functions BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Index for quickly finding default models per provider
CREATE INDEX IF NOT EXISTS idx_provider_models_default
ON public.provider_models(provider, is_default)
WHERE is_default = true;

-- Index for tier-based queries
CREATE INDEX IF NOT EXISTS idx_provider_models_tier
ON public.provider_models(provider, tier)
WHERE is_active = true;

-- =====================================================
-- 2. UPSERT CURRENT MODELS
-- =====================================================

INSERT INTO public.provider_models (
  provider, model_id, model_name, is_free, requires_api_key,
  max_tokens, max_context_tokens, max_output_tokens,
  cost_per_million_input, cost_per_million_output,
  tier, is_default, supports_streaming, supports_vision, supports_functions
) VALUES
-- OpenAI / ChatGPT
('chatgpt', 'gpt-4o', 'GPT-4o', false, true, 128000, 128000, 16384, 2.5, 10.0, 'balanced', true, true, true, true),
('chatgpt', 'gpt-4o-mini', 'GPT-4o Mini', false, true, 128000, 128000, 16384, 0.15, 0.6, 'fast', false, true, true, true),
('chatgpt', 'gpt-5', 'GPT-5', false, true, 256000, 256000, 32768, 5.0, 15.0, 'premium', false, true, true, true),

-- Anthropic / Claude
('claude', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', false, true, 200000, 200000, 8192, 3.0, 15.0, 'balanced', true, true, true, true),
('claude', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', false, true, 200000, 200000, 8192, 0.8, 4.0, 'fast', false, true, true, true),
('claude', 'claude-opus-4-1-20250805', 'Claude Opus 4.1', false, true, 200000, 200000, 32768, 15.0, 75.0, 'premium', false, true, true, true),

-- Google / Gemini
('gemini', 'gemini-2.0-flash-exp', 'Gemini 2.0 Flash', false, true, 1000000, 1000000, 8192, 0.075, 0.3, 'fast', true, true, true, true),
('gemini', 'gemini-2.0-pro', 'Gemini 2.0 Pro', false, true, 2000000, 2000000, 8192, 1.25, 5.0, 'balanced', false, true, true, true),
('gemini', 'gemini-2.0-ultra', 'Gemini 2.0 Ultra', false, true, 5000000, 5000000, 16384, 5.0, 15.0, 'premium', false, true, true, true),

-- Perplexity
('perplexity', 'llama-3.1-sonar-huge-128k-online', 'Sonar Huge 128K Online', false, true, 128000, 128000, 4096, 5.0, 5.0, 'balanced', true, true, false, false),
('perplexity', 'sonar-pro', 'Sonar Pro', false, true, 200000, 200000, 8192, 3.0, 15.0, 'premium', false, true, false, false),

-- Groq (free tier)
('groq', 'llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', true, false, 128000, 128000, 8192, 0, 0, 'balanced', true, true, false, true),
('groq', 'llama-3.1-8b-instant', 'Llama 3.1 8B Instant', true, false, 128000, 128000, 8192, 0, 0, 'fast', false, true, false, true),

-- OpenRouter (free models)
('openrouter', 'meta-llama/llama-4-maverick:free', 'Llama 4 Maverick (Free)', true, false, 1000000, 1000000, 8192, 0, 0, 'balanced', true, true, false, false),

-- HuggingFace
('huggingface', 'meta-llama/Llama-3.3-70B-Instruct', 'Llama 3.3 70B Instruct', true, false, 128000, 128000, 4096, 0, 0, 'balanced', true, true, false, false)

ON CONFLICT (provider, model_id) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  max_tokens = EXCLUDED.max_tokens,
  max_context_tokens = EXCLUDED.max_context_tokens,
  max_output_tokens = EXCLUDED.max_output_tokens,
  cost_per_million_input = EXCLUDED.cost_per_million_input,
  cost_per_million_output = EXCLUDED.cost_per_million_output,
  tier = EXCLUDED.tier,
  is_default = EXCLUDED.is_default,
  supports_streaming = EXCLUDED.supports_streaming,
  supports_vision = EXCLUDED.supports_vision,
  supports_functions = EXCLUDED.supports_functions,
  is_active = true,
  updated_at = NOW();

-- =====================================================
-- 3. INCREMENT CACHE ACCESS RPC (Phase 5.2 race condition fix)
-- =====================================================
-- Atomic increment of access_count to prevent race conditions
-- when multiple requests hit the same cached response concurrently.

CREATE OR REPLACE FUNCTION increment_cache_access(cache_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE cached_responses
  SET access_count = access_count + 1,
      last_accessed = NOW()
  WHERE id = cache_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_cache_access(UUID) IS 'Atomically increment cache access count and update last_accessed timestamp. Prevents race conditions with concurrent cache hits.';

-- =====================================================
-- 4. COLUMN COMMENTS
-- =====================================================

COMMENT ON COLUMN public.provider_models.tier IS 'Model performance tier: fast (low latency), balanced (general purpose), premium (highest capability)';
COMMENT ON COLUMN public.provider_models.max_context_tokens IS 'Maximum input context window size in tokens';
COMMENT ON COLUMN public.provider_models.max_output_tokens IS 'Maximum output generation length in tokens';
COMMENT ON COLUMN public.provider_models.supports_streaming IS 'Whether the model supports streaming responses';
COMMENT ON COLUMN public.provider_models.supports_vision IS 'Whether the model supports image/vision inputs';
COMMENT ON COLUMN public.provider_models.supports_functions IS 'Whether the model supports function/tool calling';
COMMENT ON COLUMN public.provider_models.is_default IS 'Whether this is the default model for its provider';
COMMENT ON COLUMN public.provider_models.last_verified IS 'Timestamp when this model was last verified as available';
COMMENT ON COLUMN public.provider_models.updated_at IS 'Timestamp of last record update';

-- =====================================================
-- 5. LOG MIGRATION COMPLETION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 043: Update Provider Models & Cache Access RPC completed successfully';
  RAISE NOTICE 'Added columns: tier, max_context_tokens, max_output_tokens, supports_streaming, supports_vision, supports_functions, is_default, last_verified, updated_at';
  RAISE NOTICE 'Upserted 16 provider models across 7 providers';
  RAISE NOTICE 'Created function: increment_cache_access(UUID)';
  RAISE NOTICE 'Created indexes: idx_provider_models_default, idx_provider_models_tier';
END $$;
