-- =====================================================
-- CLAUDE SESSIONS AND RANKING INTEGRATION
-- Missing table creation and ranking system integration
-- =====================================================
--
-- 🚨 IMPORTANT: READ STATUS FILE FIRST!
-- Before making ANY changes to database schema, read:
-- /root/cachegpt/STATUS_2025_09_24.md
--
-- After making changes, update STATUS file with:
-- - New tables/columns added or modified
-- - Impact on authentication or ranking systems
-- - Any migration requirements or breaking changes
--

-- Create table for storing Claude web sessions
CREATE TABLE IF NOT EXISTS public.user_claude_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_key TEXT NOT NULL,
  organization_id TEXT,
  conversation_id TEXT,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_claude_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own Claude sessions
CREATE POLICY "Users can view own Claude sessions" ON public.user_claude_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own Claude sessions
CREATE POLICY "Users can update own Claude sessions" ON public.user_claude_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own Claude sessions
CREATE POLICY "Users can insert own Claude sessions" ON public.user_claude_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own Claude sessions
CREATE POLICY "Users can delete own Claude sessions" ON public.user_claude_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for updated_at (function should exist from previous migrations)
CREATE TRIGGER handle_user_claude_sessions_updated_at
  BEFORE UPDATE ON public.user_claude_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_claude_sessions_user_id ON public.user_claude_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_claude_sessions_last_used ON public.user_claude_sessions(last_used_at DESC);

-- =====================================================
-- RANKING SYSTEM INTEGRATION FUNCTIONS
-- =====================================================

-- Add helper function to calculate and update popularity scores
-- This function is called from the ranking-cache library
CREATE OR REPLACE FUNCTION calculate_and_update_popularity_score(
  p_cached_response_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_score DECIMAL;
  v_tier VARCHAR(20);
BEGIN
  -- Calculate the popularity score using the existing ranking system
  SELECT calculate_popularity_score(p_cached_response_id) INTO v_score;

  -- Assign tier based on score
  SELECT assign_tier(v_score) INTO v_tier;

  -- Update the cached response record
  UPDATE cached_responses
  SET
    popularity_score = v_score,
    tier = v_tier,
    last_score_update = NOW()
  WHERE id = p_cached_response_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Add missing columns to cached_responses if they don't exist
-- (These should exist from ranking system, but ensure they're present)
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS query_hash TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add index for query hash lookups
CREATE INDEX IF NOT EXISTS idx_cached_responses_query_hash ON cached_responses(query_hash);
CREATE INDEX IF NOT EXISTS idx_cached_responses_user_provider ON cached_responses(user_id, provider);

-- Grant access to functions
GRANT EXECUTE ON FUNCTION calculate_and_update_popularity_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_and_update_popularity_score(UUID) TO service_role;

-- Comments
COMMENT ON TABLE public.user_claude_sessions IS 'Stores Claude web session keys for users to enable web-based authentication';
COMMENT ON FUNCTION calculate_and_update_popularity_score(UUID) IS 'Updates popularity score and tier for cached responses using the ranking system';

SELECT 'Claude sessions table and ranking integration completed. Run ranking system migrations (011, 012) first if not already done.' as status;