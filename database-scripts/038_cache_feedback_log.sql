-- Migration 038: Cache Feedback Log Table
-- Created: October 8, 2025
-- Purpose: Track individual user feedback on cached responses for analytics

-- Create feedback log table
CREATE TABLE IF NOT EXISTS public.cache_feedback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_id UUID NOT NULL REFERENCES cached_responses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feedback VARCHAR(20) NOT NULL CHECK (feedback IN ('helpful', 'outdated', 'incorrect')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_feedback_log_cache ON public.cache_feedback_log(cache_id);
CREATE INDEX IF NOT EXISTS idx_feedback_log_user ON public.cache_feedback_log(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_log_created ON public.cache_feedback_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_log_feedback ON public.cache_feedback_log(feedback);

-- RLS policies
ALTER TABLE public.cache_feedback_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own feedback
CREATE POLICY "Users can view own feedback" ON public.cache_feedback_log
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own feedback
CREATE POLICY "Users can insert feedback" ON public.cache_feedback_log
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin can see all feedback
CREATE POLICY "Admin can view all feedback" ON public.cache_feedback_log
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

COMMENT ON TABLE public.cache_feedback_log IS 'Individual user feedback records for cache quality analysis';
COMMENT ON COLUMN public.cache_feedback_log.feedback IS 'User feedback: helpful (good answer), outdated (needs refresh), incorrect (wrong answer)';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 038: Cache Feedback Log table created successfully';
  RAISE NOTICE 'Users can now rate cached responses to improve cache quality over time';
END $$;
