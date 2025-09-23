-- =====================================================
-- FIX ALL NULLABLE COLUMNS IN user_provider_credentials
-- Make all optional columns properly nullable
-- =====================================================

-- Make all optional columns nullable
DO $$
BEGIN
  -- Make key_name nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_provider_credentials'
    AND column_name = 'key_name'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_provider_credentials
    ALTER COLUMN key_name DROP NOT NULL;
    RAISE NOTICE 'Made key_name column nullable';
  END IF;

  -- Make api_key nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_provider_credentials'
    AND column_name = 'api_key'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_provider_credentials
    ALTER COLUMN api_key DROP NOT NULL;
    RAISE NOTICE 'Made api_key column nullable';
  END IF;

  -- Make llm_token nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_provider_credentials'
    AND column_name = 'llm_token'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_provider_credentials
    ALTER COLUMN llm_token DROP NOT NULL;
    RAISE NOTICE 'Made llm_token column nullable';
  END IF;

  -- Make session_token nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_provider_credentials'
    AND column_name = 'session_token'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_provider_credentials
    ALTER COLUMN session_token DROP NOT NULL;
    RAISE NOTICE 'Made session_token column nullable';
  END IF;

EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error altering columns: %', SQLERRM;
END $$;

-- Verify all columns and their nullable status
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_provider_credentials'
ORDER BY ordinal_position;

-- Output success message
SELECT 'All nullable columns fixed successfully' as status;