-- =====================================================
-- FIX AUTHENTICATION TABLE ISSUES
-- Fixes the ON CONFLICT and missing column errors
-- =====================================================

-- 1. Add unique constraint to cli_auth_sessions if it doesn't exist
DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cli_auth_sessions_user_id_key'
    AND conrelid = 'public.cli_auth_sessions'::regclass
  ) THEN
    -- Add unique constraint on user_id for upsert operations
    ALTER TABLE public.cli_auth_sessions
    ADD CONSTRAINT cli_auth_sessions_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 2. Add key_name column to user_provider_credentials if it doesn't exist
DO $$
BEGIN
  -- Check if the column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_provider_credentials'
    AND column_name = 'key_name'
  ) THEN
    -- Add nullable key_name column
    ALTER TABLE public.user_provider_credentials
    ADD COLUMN key_name TEXT;
  END IF;
END $$;

-- 3. Update any NULL key_name values to a default value for existing records
-- This is optional but helps maintain consistency
UPDATE public.user_provider_credentials
SET key_name = provider || '_credentials'
WHERE key_name IS NULL;

-- Output success message
SELECT 'Authentication tables fixed successfully' as status;