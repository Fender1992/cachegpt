-- =====================================================
-- FIX KEY_NAME COLUMN TO BE NULLABLE
-- The column was added but might have a NOT NULL constraint
-- =====================================================

-- Make key_name column nullable if it exists and has NOT NULL constraint
DO $$
BEGIN
  -- Check if the column exists and is NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_provider_credentials'
    AND column_name = 'key_name'
    AND is_nullable = 'NO'
  ) THEN
    -- Make the column nullable
    ALTER TABLE public.user_provider_credentials
    ALTER COLUMN key_name DROP NOT NULL;
    RAISE NOTICE 'Made key_name column nullable';
  ELSE
    RAISE NOTICE 'key_name column is already nullable or does not exist';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not alter key_name column: %', SQLERRM;
END $$;

-- Verify the change
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_provider_credentials'
  AND column_name = 'key_name';

-- Output success message
SELECT 'key_name column fixed successfully' as status;