-- =====================================================
-- Migration 042: External Context-Aware Caching
-- =====================================================
-- Purpose: Add support for external application context in cache keys
-- Date: January 2, 2026
--
-- Features:
-- 1. External context hash for application-provided context identifiers
-- 2. Context type for analytics and filtering
-- 3. Composite index for fast exact-match lookups
--
-- Use case: Same query + same external context = cache hit
--           Same query + different external context = cache miss
-- =====================================================

-- Add external context columns
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS external_context_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS external_context_type VARCHAR(50);

-- Composite index for exact lookup: (query_hash, external_context_hash)
-- This enables fast lookups when both query and context are provided
CREATE INDEX IF NOT EXISTS idx_cached_responses_external_context_lookup
ON cached_responses(query_hash, external_context_hash)
WHERE external_context_hash IS NOT NULL;

-- Index for analytics by context type
CREATE INDEX IF NOT EXISTS idx_cached_responses_external_context_type
ON cached_responses(external_context_type)
WHERE external_context_type IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN cached_responses.external_context_hash IS 'Application-provided context identifier (e.g., job_123, product_456). Used for exact-match cache lookups when same query + same context should return cached response.';
COMMENT ON COLUMN cached_responses.external_context_type IS 'Type hint for external context (e.g., job, product, company). Used for analytics and context-specific formatting.';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 042: External Context-Aware Caching completed successfully';
  RAISE NOTICE 'Added columns: external_context_hash, external_context_type';
  RAISE NOTICE 'Created index: idx_cached_responses_external_context_lookup (query_hash, external_context_hash)';
  RAISE NOTICE 'Created index: idx_cached_responses_external_context_type';
END $$;
