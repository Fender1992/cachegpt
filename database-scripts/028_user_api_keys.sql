-- =====================================================
-- USER API KEY MANAGEMENT SYSTEM
-- Adds secure API key storage for premium providers
-- =====================================================

-- 1. USER_API_KEYS TABLE (Stores encrypted API keys)
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('chatgpt', 'claude', 'gemini', 'perplexity')),
  api_key_encrypted TEXT NOT NULL, -- Base64 encoded API key
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one API key per user per provider
  UNIQUE(user_id, provider)
);

-- 2. Enable RLS on user_api_keys table
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy for user_api_keys
DROP POLICY IF EXISTS "Users can manage their own API keys" ON public.user_api_keys;
CREATE POLICY "Users can manage their own API keys"
  ON public.user_api_keys FOR ALL
  USING (auth.uid() = user_id);

-- 4. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_api_keys TO authenticated;

-- 5. Index for performance
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_provider ON public.user_api_keys(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_active ON public.user_api_keys(user_id, is_active) WHERE is_active = true;

-- 6. Updated_at trigger
DROP TRIGGER IF EXISTS handle_user_api_keys_updated_at ON public.user_api_keys;
CREATE TRIGGER handle_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();