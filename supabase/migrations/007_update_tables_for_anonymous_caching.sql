-- Update existing tables to support both authenticated and anonymous chat caching

-- 1. Modify the usage table to support anonymous users and chat caching
ALTER TABLE public.usage
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS response TEXT,
ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS provider TEXT;

-- Allow user_id to be NULL for anonymous users (it already can be NULL based on ON DELETE SET NULL)
-- The user_id column already supports NULL values

-- 2. Create indexes for better performance on the usage table
CREATE INDEX IF NOT EXISTS idx_usage_user_id_null ON public.usage(user_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_usage_prompt ON public.usage(prompt);
CREATE INDEX IF NOT EXISTS idx_usage_created_at_desc ON public.usage(created_at DESC);

-- 3. Update RLS policies for the usage table to support anonymous access
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage;
DROP POLICY IF EXISTS "Users can insert own usage" ON public.usage;

-- Allow authenticated users to see their own usage
CREATE POLICY "Users can view own usage" ON public.usage
  FOR SELECT USING (
    auth.uid() = user_id OR
    user_id IS NULL  -- Everyone can see anonymous cache
  );

-- Allow authenticated users to insert their own usage
CREATE POLICY "Users can insert own usage" ON public.usage
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR
    (auth.uid() IS NULL AND user_id IS NULL)  -- Anonymous users can insert with NULL user_id
  );

-- Allow anonymous users to insert usage records
CREATE POLICY "Anonymous can insert usage" ON public.usage
  FOR INSERT WITH CHECK (
    user_id IS NULL
  );

-- 4. Modify claude_conversations to support UUID user_id and anonymous users
ALTER TABLE public.claude_conversations
ALTER COLUMN user_id TYPE UUID USING user_id::UUID,
ADD CONSTRAINT claude_conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. Create a function to track cache hits for efficiency metrics
CREATE OR REPLACE FUNCTION public.record_cache_hit(
  p_prompt TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if we have a cache hit
  IF EXISTS (
    SELECT 1 FROM public.usage
    WHERE prompt = p_prompt
    AND (user_id = p_user_id OR (p_user_id IS NULL AND user_id IS NULL))
    AND created_at > NOW() - INTERVAL '30 days'
  ) THEN
    -- Update the cache hit flag on the most recent matching entry
    UPDATE public.usage
    SET cache_hit = TRUE
    WHERE prompt = p_prompt
    AND (user_id = p_user_id OR (p_user_id IS NULL AND user_id IS NULL))
    AND created_at = (
      SELECT MAX(created_at)
      FROM public.usage
      WHERE prompt = p_prompt
      AND (user_id = p_user_id OR (p_user_id IS NULL AND user_id IS NULL))
    );
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create a view to show cache statistics
CREATE OR REPLACE VIEW public.cache_statistics AS
SELECT
  COUNT(*) as total_requests,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as authenticated_requests,
  COUNT(CASE WHEN user_id IS NULL THEN 1 END) as anonymous_requests,
  COUNT(CASE WHEN cache_hit = TRUE THEN 1 END) as cache_hits,
  ROUND(COUNT(CASE WHEN cache_hit = TRUE THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as cache_hit_rate,
  AVG(tokens_used) as avg_tokens_used,
  AVG(response_time_ms) as avg_response_time_ms,
  MIN(created_at) as oldest_entry,
  MAX(created_at) as newest_entry
FROM public.usage
WHERE prompt IS NOT NULL AND response IS NOT NULL;

-- Grant permissions on the view
GRANT SELECT ON public.cache_statistics TO anon, authenticated;

-- 7. Add a cleanup function for old anonymous cache entries
CREATE OR REPLACE FUNCTION public.cleanup_old_anonymous_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete anonymous cache entries older than 30 days
  DELETE FROM public.usage
  WHERE user_id IS NULL
  AND created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Also clean up old anonymous conversations
  DELETE FROM public.claude_conversations
  WHERE user_id IS NULL
  AND last_updated < NOW() - INTERVAL '30 days';

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the functions
GRANT EXECUTE ON FUNCTION public.record_cache_hit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_anonymous_cache TO service_role;