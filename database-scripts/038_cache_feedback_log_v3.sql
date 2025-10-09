-- Migration 038: Cache Feedback Log Table (Version 3)
-- Created: October 8, 2025
-- Purpose: Track individual user feedback on cached responses for analytics
-- Fixed: Works with UNIQUE constraint (doesn't require PRIMARY KEY)

-- Create feedback log table
-- Uses cache_id with foreign key to cached_responses(id) which has UNIQUE constraint
CREATE TABLE IF NOT EXISTS public.cache_feedback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_id UUID NOT NULL,
  user_id UUID,
  feedback VARCHAR(20) NOT NULL CHECK (feedback IN ('helpful', 'outdated', 'incorrect')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint to cached_responses
-- This works because id has a UNIQUE constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cache_feedback_log_cache_id_fkey'
  ) THEN
    -- Find the actual constraint name on cached_responses(id)
    EXECUTE (
      SELECT 'ALTER TABLE public.cache_feedback_log ADD CONSTRAINT cache_feedback_log_cache_id_fkey FOREIGN KEY (cache_id) REFERENCES cached_responses(id) ON DELETE CASCADE'
    );
    RAISE NOTICE 'Added foreign key constraint to cached_responses(id)';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add foreign key: %', SQLERRM;
END $$;

-- Add foreign key to auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cache_feedback_log_user_id_fkey'
  ) THEN
    ALTER TABLE public.cache_feedback_log
    ADD CONSTRAINT cache_feedback_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added foreign key constraint to auth.users';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add user foreign key: %', SQLERRM;
END $$;

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_feedback_log_cache ON public.cache_feedback_log(cache_id);
CREATE INDEX IF NOT EXISTS idx_feedback_log_user ON public.cache_feedback_log(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_log_created ON public.cache_feedback_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_log_feedback ON public.cache_feedback_log(feedback);

-- RLS policies
ALTER TABLE public.cache_feedback_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own feedback" ON public.cache_feedback_log;
DROP POLICY IF EXISTS "Users can insert feedback" ON public.cache_feedback_log;
DROP POLICY IF EXISTS "Admin can view all feedback" ON public.cache_feedback_log;

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

-- Verify everything worked
DO $$
DECLARE
  fk_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cache_feedback_log_cache_id_fkey'
  ) INTO fk_exists;

  IF fk_exists THEN
    RAISE NOTICE '✅ Migration 038 V3: Cache Feedback Log created successfully with foreign keys';
  ELSE
    RAISE NOTICE '⚠️ Migration 038 V3: Table created but foreign key constraint may have failed';
    RAISE NOTICE 'You can still use the table, but ON DELETE CASCADE won''t work';
  END IF;
END $$;
