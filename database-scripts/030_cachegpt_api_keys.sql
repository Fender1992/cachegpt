-- =====================================================
-- CACHEGPT API KEY SYSTEM
-- Allows users to generate API keys to use CacheGPT in their own applications
-- =====================================================

-- 1. CACHEGPT_API_KEYS TABLE (Stores user-generated API keys for programmatic access)
CREATE TABLE IF NOT EXISTS public.cachegpt_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key_name TEXT NOT NULL, -- User-friendly name like "Production App", "Dev Environment"
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the actual key (we never store the plain key)
  key_prefix TEXT NOT NULL, -- First 8 chars to help users identify the key (e.g., "cgpt_sk_abc123")
  last_used_at TIMESTAMP WITH TIME ZONE,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional info like IP whitelist, rate limits, etc.

  CONSTRAINT key_name_length CHECK (char_length(key_name) <= 100)
);

-- 2. Enable RLS on cachegpt_api_keys table
ALTER TABLE public.cachegpt_api_keys ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.cachegpt_api_keys;
CREATE POLICY "Users can view their own API keys"
  ON public.cachegpt_api_keys FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own API keys" ON public.cachegpt_api_keys;
CREATE POLICY "Users can create their own API keys"
  ON public.cachegpt_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own API keys" ON public.cachegpt_api_keys;
CREATE POLICY "Users can update their own API keys"
  ON public.cachegpt_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.cachegpt_api_keys;
CREATE POLICY "Users can delete their own API keys"
  ON public.cachegpt_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cachegpt_api_keys TO authenticated;
GRANT SELECT ON public.cachegpt_api_keys TO anon; -- For API key authentication

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cachegpt_api_keys_user_id ON public.cachegpt_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_cachegpt_api_keys_key_hash ON public.cachegpt_api_keys(key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cachegpt_api_keys_active ON public.cachegpt_api_keys(user_id, is_active) WHERE is_active = true;

-- 6. Updated_at trigger
DROP TRIGGER IF EXISTS handle_cachegpt_api_keys_updated_at ON public.cachegpt_api_keys;
CREATE TRIGGER handle_cachegpt_api_keys_updated_at
  BEFORE UPDATE ON public.cachegpt_api_keys
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 7. Function to validate API key (used by API endpoints)
CREATE OR REPLACE FUNCTION validate_cachegpt_api_key(api_key_hash TEXT)
RETURNS TABLE(user_id UUID, key_id UUID, is_valid BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.user_id,
    k.id AS key_id,
    (k.is_active AND (k.expires_at IS NULL OR k.expires_at > NOW())) AS is_valid
  FROM public.cachegpt_api_keys k
  WHERE k.key_hash = api_key_hash
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to increment usage count
CREATE OR REPLACE FUNCTION increment_api_key_usage(api_key_hash TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.cachegpt_api_keys
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE key_hash = api_key_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_cachegpt_api_key(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_api_key_usage(TEXT) TO authenticated, anon;
