-- =====================================================
-- FIX VECTOR COLUMN TYPE
-- Ensures embedding column uses proper pgvector type
-- =====================================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Check current column type and fix if needed
DO $$
BEGIN
  -- Check if cached_responses table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'cached_responses'
  ) THEN
    -- Check current column type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'cached_responses'
      AND column_name = 'embedding'
      AND data_type != 'USER-DEFINED'
    ) THEN
      -- Column exists but wrong type, need to convert
      -- First rename old column
      ALTER TABLE cached_responses RENAME COLUMN embedding TO embedding_old;

      -- Add new column with correct type
      ALTER TABLE cached_responses ADD COLUMN embedding vector(384);

      -- Migrate data if any exists (convert array to vector)
      UPDATE cached_responses
      SET embedding = embedding_old::vector(384)
      WHERE embedding_old IS NOT NULL;

      -- Drop old column
      ALTER TABLE cached_responses DROP COLUMN embedding_old;
    END IF;
  END IF;
END $$;

-- Verify the column type is correct
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'cached_responses'
AND column_name = 'embedding';

-- Add comment
COMMENT ON COLUMN cached_responses.embedding IS 'Embedding vector for semantic similarity search (pgvector type)';