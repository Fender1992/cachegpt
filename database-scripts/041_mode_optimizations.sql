-- ============================================================================
-- MODE OPTIMIZATION PARAMETERS
-- Add temperature, max_tokens, and preferred_model to public_modes table
-- ============================================================================

-- First, ensure required feature flags exist for Phase 3 features
-- Note: Column is 'key', not 'flag_key' (common mistake)
INSERT INTO feature_flags (key, enabled, description, user_id)
VALUES
  ('share_answer_enabled', true, 'Enable shareable answer links', NULL),
  ('templates_gallery_trending', true, 'Enable templates gallery and trending', NULL)
ON CONFLICT (key, user_id)
DO UPDATE SET
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description;

-- ============================================================================
-- MODE OPTIMIZATION PARAMETERS
-- ============================================================================

-- Add new optimization columns to public_modes
ALTER TABLE public.public_modes
  ADD COLUMN IF NOT EXISTS temperature DECIMAL(3,2) DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS preferred_model TEXT,
  ADD COLUMN IF NOT EXISTS context_window_size TEXT DEFAULT 'standard';

-- Add check constraints (skip if already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'temperature_range'
  ) THEN
    ALTER TABLE public.public_modes
      ADD CONSTRAINT temperature_range CHECK (temperature >= 0 AND temperature <= 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'max_tokens_range'
  ) THEN
    ALTER TABLE public.public_modes
      ADD CONSTRAINT max_tokens_range CHECK (max_tokens >= 100 AND max_tokens <= 8000);
  END IF;
END $$;

COMMENT ON COLUMN public.public_modes.temperature IS 'Temperature for AI responses (0-2). Lower = more deterministic, Higher = more creative';
COMMENT ON COLUMN public.public_modes.max_tokens IS 'Maximum response length in tokens (100-8000)';
COMMENT ON COLUMN public.public_modes.preferred_model IS 'Preferred model for this mode (chatgpt, claude, gemini, perplexity, or null for auto)';
COMMENT ON COLUMN public.public_modes.context_window_size IS 'Context window size: minimal (4 messages), standard (20 messages), extended (50 messages)';

-- Update existing modes with optimized parameters based on their purpose
-- Note: Adjust these based on your actual mode slugs

-- Coding/Technical modes - precise and deterministic
UPDATE public.public_modes
SET
  temperature = 0.2,
  max_tokens = 3000,
  preferred_model = 'claude',
  context_window_size = 'standard'
WHERE slug IN ('code-helper', 'debug-assistant', 'code-review', 'technical-writer');

-- Creative modes - more randomness and creativity
UPDATE public.public_modes
SET
  temperature = 0.8,
  max_tokens = 4000,
  preferred_model = 'chatgpt',
  context_window_size = 'standard'
WHERE slug IN ('creative-writer', 'storyteller', 'content-creator', 'brainstorm');

-- Business/Professional modes - balanced
UPDATE public.public_modes
SET
  temperature = 0.5,
  max_tokens = 2000,
  preferred_model = null,
  context_window_size = 'standard'
WHERE slug IN ('business-writer', 'email-assistant', 'professional', 'meeting-notes');

-- Research modes - prefer Perplexity for web access
UPDATE public.public_modes
SET
  temperature = 0.4,
  max_tokens = 3000,
  preferred_model = 'perplexity',
  context_window_size = 'extended'
WHERE slug IN ('research-assistant', 'fact-checker', 'academic-helper');

-- Quick Q&A modes - fast and concise
UPDATE public.public_modes
SET
  temperature = 0.3,
  max_tokens = 800,
  preferred_model = 'gemini',
  context_window_size = 'minimal'
WHERE slug IN ('quick-answer', 'explain-like-im-5', 'simple-explainer');

-- Teaching/Tutorial modes - clear and structured
UPDATE public.public_modes
SET
  temperature = 0.4,
  max_tokens = 2500,
  preferred_model = 'claude',
  context_window_size = 'standard'
WHERE slug IN ('tutor', 'teacher', 'learning-assistant', 'study-helper');

-- Translation modes - precise
UPDATE public.public_modes
SET
  temperature = 0.2,
  max_tokens = 1500,
  preferred_model = null,
  context_window_size = 'minimal'
WHERE slug IN ('translator', 'language-helper');

-- General assistant - defaults (keep existing)
UPDATE public.public_modes
SET
  temperature = 0.7,
  max_tokens = 2000,
  preferred_model = null,
  context_window_size = 'standard'
WHERE slug IN ('general-assistant', 'chat-assistant');

COMMENT ON TABLE public.public_modes IS 'Pre-configured AI modes/templates with optimization parameters for different use cases';
