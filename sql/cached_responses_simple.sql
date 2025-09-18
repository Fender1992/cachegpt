-- =====================================================
-- SIMPLE NON-PARTITIONED CACHE TABLE (RECOMMENDED)
-- Easier to manage, no partitioning complexity
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing table if needed (be careful in production!)
-- DROP TABLE IF EXISTS cached_responses CASCADE;

-- Create simple table without partitioning
CREATE TABLE IF NOT EXISTS cached_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Query and response
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,
  response TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,

  -- Vector embedding for similarity
  embedding vector(384),

  -- User and access tracking
  user_id UUID,
  access_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',

  -- Cost tracking
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- CRITICAL: Unique index for exact cache lookups
-- This provides O(1) lookup performance
CREATE UNIQUE INDEX idx_query_hash_model_user
  ON cached_responses (query_hash, model, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- High-performance vector similarity index
CREATE INDEX idx_embedding_hnsw
  ON cached_responses USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- User query index
CREATE INDEX idx_user_model_created
  ON cached_responses (user_id, model, created_at DESC);

-- Cleanup index
CREATE INDEX idx_expires_at
  ON cached_responses (expires_at)
  WHERE expires_at IS NOT NULL;

-- Hot cache index for frequently accessed items
CREATE INDEX idx_hot_cache
  ON cached_responses (access_count DESC, last_accessed DESC)
  WHERE access_count > 5;

-- Model-specific index
CREATE INDEX idx_model_created
  ON cached_responses (model, created_at DESC);

-- =====================================================
-- OPTIMIZED FUNCTIONS
-- =====================================================

-- Fast exact match lookup
CREATE OR REPLACE FUNCTION find_exact_cache(
  p_query TEXT,
  p_model VARCHAR(100),
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  response TEXT,
  tokens_used INTEGER,
  cost_saved DECIMAL,
  access_count INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_query_hash VARCHAR(64);
BEGIN
  -- Calculate hash
  v_query_hash := encode(sha256(p_query::bytea), 'hex');

  -- Update access stats and return in one query
  RETURN QUERY
  UPDATE cached_responses
  SET
    access_count = cached_responses.access_count + 1,
    last_accessed = NOW()
  WHERE
    query_hash = v_query_hash
    AND model = p_model
    AND (p_user_id IS NULL OR user_id = p_user_id OR user_id IS NULL)
    AND expires_at > NOW()
  RETURNING
    cached_responses.id,
    cached_responses.response,
    cached_responses.tokens_used,
    cached_responses.cost_saved,
    cached_responses.access_count;
END;
$$;

-- Semantic similarity search
CREATE OR REPLACE FUNCTION find_similar_cache(
  p_embedding vector,
  p_model VARCHAR(100),
  p_threshold FLOAT DEFAULT 0.85,
  p_limit INT DEFAULT 1,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  query TEXT,
  response TEXT,
  similarity FLOAT,
  tokens_used INTEGER,
  cost_saved DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH matches AS (
    SELECT
      cr.id,
      cr.query,
      cr.response,
      1 - (cr.embedding <=> p_embedding) as similarity,
      cr.tokens_used,
      cr.cost_saved
    FROM cached_responses cr
    WHERE
      cr.model = p_model
      AND (p_user_id IS NULL OR cr.user_id = p_user_id OR cr.user_id IS NULL)
      AND cr.expires_at > NOW()
      AND cr.embedding IS NOT NULL
      AND 1 - (cr.embedding <=> p_embedding) > p_threshold
    ORDER BY cr.embedding <=> p_embedding
    LIMIT p_limit
  )
  SELECT * FROM matches;

  -- Update access count for returned entries
  UPDATE cached_responses
  SET
    access_count = access_count + 1,
    last_accessed = NOW()
  WHERE id IN (SELECT m.id FROM matches m);
END;
$$;

-- Insert or update cache entry
CREATE OR REPLACE FUNCTION upsert_cache(
  p_query TEXT,
  p_response TEXT,
  p_model VARCHAR(100),
  p_embedding vector DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_tokens INTEGER DEFAULT 0,
  p_cost_saved DECIMAL DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_query_hash VARCHAR(64);
  v_user_id UUID;
  v_id UUID;
BEGIN
  -- Calculate hash
  v_query_hash := encode(sha256(p_query::bytea), 'hex');
  v_user_id := COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Insert or update
  INSERT INTO cached_responses (
    query, response, model, embedding, user_id, tokens_used, cost_saved
  ) VALUES (
    p_query, p_response, p_model, p_embedding, p_user_id, p_tokens, p_cost_saved
  )
  ON CONFLICT (query_hash, model, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    response = EXCLUDED.response,
    access_count = cached_responses.access_count + 1,
    last_accessed = NOW(),
    expires_at = NOW() + INTERVAL '30 days'
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired entries
  DELETE FROM cached_responses
  WHERE expires_at < NOW()
    OR (access_count < 2 AND created_at < NOW() - INTERVAL '7 days')
    OR (access_count < 5 AND created_at < NOW() - INTERVAL '30 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Vacuum analyze the table
  ANALYZE cached_responses;

  RETURN deleted_count;
END;
$$;

-- =====================================================
-- MONITORING VIEWS
-- =====================================================

CREATE OR REPLACE VIEW cache_stats AS
SELECT
  (SELECT COUNT(*) FROM cached_responses) as total_entries,
  (SELECT COUNT(*) FROM cached_responses WHERE created_at > NOW() - INTERVAL '1 hour') as new_entries_hour,
  (SELECT AVG(access_count) FROM cached_responses) as avg_access_count,
  (SELECT COUNT(DISTINCT model) FROM cached_responses) as unique_models,
  (SELECT SUM(cost_saved) FROM cached_responses) as total_savings,
  (SELECT COUNT(*)::FLOAT / NULLIF(COUNT(*) + COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'), 0)
   FROM cached_responses
   WHERE created_at > NOW() - INTERVAL '1 hour') as hit_rate_hour;

-- =====================================================
-- RLS POLICIES (if using Supabase auth)
-- =====================================================

-- ALTER TABLE cached_responses ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users read own cache" ON cached_responses
--   FOR SELECT TO authenticated
--   USING (auth.uid() = user_id OR user_id IS NULL);

-- CREATE POLICY "Users write own cache" ON cached_responses
--   FOR INSERT TO authenticated
--   WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- USAGE EXAMPLE
-- =====================================================

/*
-- 1. Check for exact cache hit
SELECT * FROM find_exact_cache('What is AI?', 'gpt-3.5-turbo', NULL);

-- 2. If no exact match, do semantic search
SELECT * FROM find_similar_cache(
  '[0.1, 0.2, ...]'::vector,  -- embedding vector
  'gpt-3.5-turbo',
  0.85,  -- similarity threshold
  1      -- limit
);

-- 3. Insert/update cache entry
SELECT upsert_cache(
  'What is AI?',
  'AI is artificial intelligence...',
  'gpt-3.5-turbo',
  '[0.1, 0.2, ...]'::vector,
  NULL,  -- user_id
  150,   -- tokens
  0.30   -- cost saved
);

-- 4. Cleanup old entries
SELECT cleanup_expired_cache();

-- 5. View statistics
SELECT * FROM cache_stats;
*/