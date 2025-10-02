-- =====================================================
-- PGVECTOR SETUP FOR SEMANTIC CACHING
-- Enables true semantic similarity search with OpenAI embeddings
-- =====================================================

-- 1. Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Update cached_responses table to use proper vector type
-- Current: embedding is stored as JSONB (inefficient)
-- New: Use vector(1536) for OpenAI text-embedding-3-small

-- Drop the old embedding column if it exists
ALTER TABLE public.cached_responses
  DROP COLUMN IF EXISTS embedding;

-- Add new vector column (1536 dimensions for text-embedding-3-small)
ALTER TABLE public.cached_responses
  ADD COLUMN embedding vector(1536);

-- 3. Create index for fast similarity search using cosine distance
-- This enables <=> operator for fast nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_cached_responses_embedding
  ON public.cached_responses
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Note: IVFFlat index requires some data to work well
-- Alternative: For smaller datasets, use HNSW (more accurate, slower inserts):
-- CREATE INDEX IF NOT EXISTS idx_cached_responses_embedding_hnsw
--   ON public.cached_responses
--   USING hnsw (embedding vector_cosine_ops);

-- 4. Create function for semantic cache lookup
CREATE OR REPLACE FUNCTION find_similar_cached_response(
  query_embedding vector(1536),
  similarity_threshold float DEFAULT 0.85,
  result_limit int DEFAULT 1,
  provider_filter text DEFAULT NULL,
  model_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  query text,
  response text,
  model text,
  provider text,
  similarity float,
  access_count bigint,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.query,
    cr.response,
    cr.model,
    cr.provider,
    1 - (cr.embedding <=> query_embedding) as similarity,
    cr.access_count,
    cr.created_at
  FROM public.cached_responses cr
  WHERE
    cr.is_archived = false
    AND cr.embedding IS NOT NULL
    AND (provider_filter IS NULL OR cr.provider = provider_filter)
    AND (model_filter IS NULL OR cr.model = model_filter)
    AND (1 - (cr.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY cr.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION find_similar_cached_response TO authenticated, anon;

-- 6. Add comment for documentation
COMMENT ON COLUMN public.cached_responses.embedding IS
  'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic similarity search';

COMMENT ON FUNCTION find_similar_cached_response IS
  'Find cached responses semantically similar to query embedding using cosine similarity';

-- 7. Performance optimization: Add covering index for common queries
CREATE INDEX IF NOT EXISTS idx_cached_responses_provider_model_active
  ON public.cached_responses(provider, model, is_archived)
  WHERE is_archived = false;

-- 8. Analyze to update statistics (run VACUUM separately if needed)
ANALYZE public.cached_responses;

-- Note: Run "VACUUM ANALYZE public.cached_responses;" manually outside transaction if desired

-- =====================================================
-- MIGRATION NOTES:
--
-- 1. Existing embeddings (JSONB) are dropped - they were simple/inefficient
-- 2. New embeddings will be generated using OpenAI API as queries come in
-- 3. The ivfflat index will improve as more embeddings are added
-- 4. For better initial performance, you can pre-generate embeddings for existing cache entries
--
-- Cost estimate:
-- - OpenAI embeddings: $0.02 per 1M tokens
-- - Average query: ~20 tokens
-- - 100K cached entries = 2M tokens = $0.04
--
-- Performance:
-- - Similarity search: <50ms for millions of vectors
-- - Cache lookup: Sub-10ms with index
-- =====================================================
