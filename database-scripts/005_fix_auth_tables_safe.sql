-- =====================================================
-- FIX AUTHENTICATION TABLE ISSUES (SAFE VERSION)
-- Fixes the ON CONFLICT and missing column errors
-- Handles cases where tables/policies already exist
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
    RAISE NOTICE 'Added unique constraint on cli_auth_sessions.user_id';
  ELSE
    RAISE NOTICE 'Unique constraint on cli_auth_sessions.user_id already exists';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
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
    RAISE NOTICE 'Added key_name column to user_provider_credentials';
  ELSE
    RAISE NOTICE 'Column key_name already exists in user_provider_credentials';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add key_name column: %', SQLERRM;
END $$;

-- 3. Update any NULL key_name values to a default value for existing records
-- This is optional but helps maintain consistency
DO $$
BEGIN
  UPDATE public.user_provider_credentials
  SET key_name = provider || '_credentials'
  WHERE key_name IS NULL;
  RAISE NOTICE 'Updated NULL key_name values';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update key_name values: %', SQLERRM;
END $$;

-- 4. Drop and recreate RLS policies (safer approach)
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can manage their own CLI auth sessions" ON public.cli_auth_sessions;
  DROP POLICY IF EXISTS "Users can manage their own provider credentials" ON public.user_provider_credentials;

  -- Recreate policies
  CREATE POLICY "Users can manage their own CLI auth sessions"
    ON public.cli_auth_sessions
    FOR ALL
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can manage their own provider credentials"
    ON public.user_provider_credentials
    FOR ALL
    USING (auth.uid() = user_id);

  RAISE NOTICE 'RLS policies recreated successfully';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not recreate RLS policies: %', SQLERRM;
END $$;

-- Output success message
SELECT 'Authentication tables fixed successfully' as status;