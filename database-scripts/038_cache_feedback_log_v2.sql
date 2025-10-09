-- Migration 038: Cache Feedback Log Table (Version 2)
-- Created: October 8, 2025
-- Purpose: Track individual user feedback on cached responses for analytics
-- Fixed: Handle missing primary key on cached_responses

-- Step 1: Check what constraints exist on cached_responses
DO $$
DECLARE
  has_pk BOOLEAN;
  pk_column TEXT;
BEGIN
  -- Check for primary key
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'cached_responses'
    AND c.contype = 'p'
  ) INTO has_pk;

  IF has_pk THEN
    -- Get the column name of the primary key
    SELECT a.attname INTO pk_column
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'cached_responses' AND c.contype = 'p'
    LIMIT 1;

    RAISE NOTICE 'Primary key exists on column: %', pk_column;
  ELSE
    RAISE NOTICE 'No primary key found on cached_responses';

    -- Add primary key on id column
    ALTER TABLE cached_responses ADD PRIMARY KEY (id);
    RAISE NOTICE 'Added primary key to cached_responses(id)';
  END IF;
END $$;

-- Step 2: Create feedback log table without foreign key constraint first
CREATE TABLE IF NOT EXISTS public.cache_feedback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_id UUID NOT NULL,
  user_id UUID,
  feedback VARCHAR(20) NOT NULL CHECK (feedback IN ('helpful', 'outdated', 'incorrect')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Add foreign key constraints separately
DO $$
BEGIN
  -- Add foreign key to cached_responses if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cache_feedback_log_cache_id_fkey'
  ) THEN
    ALTER TABLE public.cache_feedback_log
    ADD CONSTRAINT cache_feedback_log_cache_id_fkey
    FOREIGN KEY (cache_id) REFERENCES cached_responses(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added foreign key constraint to cached_responses';
  END IF;

  -- Add foreign key to auth.users if not exists
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
    RAISE NOTICE 'Error adding foreign keys: %', SQLERRM;
    RAISE NOTICE 'You may need to manually add primary key to cached_responses';
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

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 038 V2: Cache Feedback Log table created';
  RAISE NOTICE 'If foreign key constraint failed, run this manually:';
  RAISE NOTICE 'ALTER TABLE cached_responses ADD PRIMARY KEY (id);';
  RAISE NOTICE 'Then re-run this migration';
END $$;
