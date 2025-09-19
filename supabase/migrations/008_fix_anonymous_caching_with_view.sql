-- Update existing tables to support both authenticated and anonymous chat caching
-- This version handles the view dependency issue

-- 1. Drop the view that depends on user_id column
DROP VIEW IF EXISTS conversation_summaries CASCADE;

-- 2. Modify the usage table to support anonymous users and chat caching
ALTER TABLE public.usage
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS response TEXT,
ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS provider TEXT;

-- 3. Modify claude_conversations to support UUID user_id and anonymous users
-- First, we need to handle the conversion carefully
ALTER TABLE public.claude_conversations
DROP CONSTRAINT IF EXISTS claude_conversations_user_id_fkey;

-- Convert user_id to UUID (it's currently TEXT)
-- This will set NULL for any non-UUID values
ALTER TABLE public.claude_conversations
ALTER COLUMN user_id TYPE UUID USING
  CASE
    WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN user_id::UUID
    ELSE NULL
  END;

-- Add the foreign key constraint
ALTER TABLE public.claude_conversations
ADD CONSTRAINT claude_conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Recreate the conversation_summaries view with the updated schema
CREATE VIEW conversation_summaries AS
SELECT
    c.id,
    c.session_id,
    c.user_id,  -- Now properly typed as UUID
    c.project_path,
    c.git_branch,
    c.started_at,
    c.last_updated,
    COUNT(m.id) as message_count,
    MIN(m.timestamp) as first_message_at,
    MAX(m.timestamp) as last_message_at,
    array_agg(DISTINCT m.role) as roles_used,
    array_agg(DISTINCT m.model) FILTER (WHERE m.model IS NOT NULL) as models_used
FROM claude_conversations c
LEFT JOIN claude_messages m ON c.id = m.conversation_id
GROUP BY c.id, c.session_id, c.user_id, c.project_path, c.git_branch, c.started_at, c.last_updated;

-- 5. Create indexes for better performance on the usage table
CREATE INDEX IF NOT EXISTS idx_usage_user_id_null ON public.usage(user_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_usage_prompt ON public.usage(prompt);
CREATE INDEX IF NOT EXISTS idx_usage_created_at_desc ON public.usage(created_at DESC);

-- 6. Update RLS policies for the usage table to support anonymous access
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage;
DROP POLICY IF EXISTS "Users can insert own usage" ON public.usage;

-- Allow authenticated users to see their own usage and anonymous cache
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

-- 7. Create a function to track cache hits for efficiency metrics
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

-- 8. Create a view to show cache statistics
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
GRANT SELECT ON conversation_summaries TO anon, authenticated;

-- 9. Add a cleanup function for old anonymous cache entries
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