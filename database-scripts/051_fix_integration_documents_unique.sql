-- =====================================================
-- FIX: Change regular index to UNIQUE constraint on integration_documents
-- Required for Supabase upsert with onConflict to work correctly
-- =====================================================

-- Drop the old regular index
DROP INDEX IF EXISTS idx_integration_documents_dedup;

-- Add proper UNIQUE constraint (idempotent: skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_integration_documents_dedup'
  ) THEN
    ALTER TABLE public.integration_documents
      ADD CONSTRAINT uq_integration_documents_dedup
      UNIQUE (user_id, provider, source_id, chunk_index);
  END IF;
END $$;
