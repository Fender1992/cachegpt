-- =====================================================
-- OPTIMIZED DATABASE SCHEMA FOR CACHEGPT (FIXED)
-- High-performance caching with sub-10ms lookups
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For fuzzy text matching
CREATE EXTENSION IF NOT EXISTS btree_gist; -- For exclusion constraints

-- =====================================================
-- MAIN CACHE TABLE WITH FIXED PARTITIONING
-- =====================================================

CREATE TABLE IF NOT EXISTS cached_responses (
  -- Fixed: Include created_at in primary key for partitioning
  id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Query fields with hash for O(1) exact lookups
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,

  -- Response and metadata
  response TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,

  -- Vector embedding for similarity search
  embedding vector(384), -- 384 dimensions for all-MiniLM-L6-v2

  -- User and access tracking
  user_id UUID,
  access_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- TTL and timestamps
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',

  -- Cost tracking
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Fixed: Include created_at in primary key for partitioning
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (example for 2024-2025)
CREATE TABLE cached_responses_2024_12 PARTITION OF cached_responses
  FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE cached_responses_2025_01 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE cached_responses_2025_02 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE cached_responses_2025_03 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Function to auto-create partitions
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'cached_responses_' || TO_CHAR(start_date, 'YYYY_MM');

  -- Check if partition exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF cached_responses FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      start_date,
      end_date
    );

    RAISE NOTICE 'Created partition %', partition_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ALTERNATIVE: NON-PARTITIONED TABLE (SIMPLER)
-- Use this if you don't need partitioning
-- =====================================================

CREATE TABLE IF NOT EXISTS cached_responses_simple (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Query fields with hash for O(1) exact lookups
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,

  -- Response and metadata
  response TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,

  -- Vector embedding for similarity search
  embedding vector(384),

  -- User and access tracking
  user_id UUID,
  access_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- TTL and timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',

  -- Cost tracking
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'
);

-- =====================================================
-- HIGH-PERFORMANCE INDEXES
-- =====================================================

-- For partitioned table (create on each partition)
CREATE INDEX idx_query_hash_model_user_2024_12
  ON cached_responses_2024_12(query_hash, model, user_id);

CREATE INDEX idx_query_hash_model_user_2025_01
  ON cached_responses_2025_01(query_hash, model, user_id);

CREATE INDEX idx_query_hash_model_user_2025_02
  ON cached_responses_2025_02(query_hash, model, user_id);

-- For simple table
CREATE UNIQUE INDEX idx_simple_query_hash_model_user
  ON cached_responses_simple(query_hash, model, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Vector similarity search using HNSW
CREATE INDEX idx_embedding_hnsw_simple
  ON cached_responses_simple USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Composite index for user queries
CREATE INDEX idx_user_model_created_simple
  ON cached_responses_simple(user_id, model, created_at DESC);

-- Hot cache index (frequently accessed items)
CREATE INDEX idx_hot_cache_simple
  ON cached_responses_simple(access_count DESC, last_accessed DESC)
  WHERE access_count > 5;

-- TTL index for cleanup
CREATE INDEX idx_expires_at_simple
  ON cached_responses_simple(expires_at)
  WHERE expires_at IS NOT NULL;

-- Model-specific queries
CREATE INDEX idx_model_created_simple
  ON cached_responses_simple(model, created_at DESC);

-- =====================================================
-- HOT CACHE TABLE (UNLOGGED FOR SPEED)
-- =====================================================

CREATE UNLOGGED TABLE IF NOT EXISTS hot_cache (
  query_hash VARCHAR(64) PRIMARY KEY,
  query TEXT NOT NULL, -- Store original query for promotion
  response TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,
  user_id UUID,
  tokens_used INTEGER DEFAULT 0,
  embedding vector(384),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Simple index for hot cache
CREATE INDEX idx_hot_cache_created ON hot_cache(created_at DESC);
CREATE INDEX idx_hot_cache_model_user ON hot_cache(model, user_id);

-- =====================================================
-- USAGE TRACKING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  api_key_id UUID,

  -- Request details
  model VARCHAR(100),
  endpoint VARCHAR(255),
  tokens_used INTEGER,

  -- Cache performance
  cache_hit BOOLEAN DEFAULT false,
  cache_type VARCHAR(20), -- 'exact', 'semantic', 'miss'
  similarity_score FLOAT,

  -- Cost analysis
  cost DECIMAL(10,6),
  cost_saved DECIMAL(10,6),

  -- Performance metrics
  response_time_ms INTEGER,
  cache_lookup_ms INTEGER,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX idx_usage_user_daily
  ON usage_tracking(user_id, (created_at::date) DESC);

CREATE INDEX idx_usage_cache_hits
  ON usage_tracking(cache_hit, created_at DESC);

CREATE INDEX idx_usage_model
  ON usage_tracking(model, created_at DESC);

-- =====================================================
-- API KEYS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  key VARCHAR(255) UNIQUE NOT NULL,
  key_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(key::bytea), 'hex')) STORED,
  name VARCHAR(100),
  permissions JSONB DEFAULT '{"read": true, "write": true}',
  rate_limit_tier VARCHAR(20) DEFAULT 'standard',
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE is_active = true;

-- =====================================================
-- OPTIMIZED FUNCTIONS FOR SIMPLE TABLE
-- =====================================================

-- Fast exact match lookup (use this for production)
CREATE OR REPLACE FUNCTION find_exact_cache(
  p_query TEXT,
  p_model VARCHAR(100),
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  response TEXT,
  tokens_used INTEGER,
  cost_saved DECIMAL
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
  UPDATE cached_responses_simple
  SET
    access_count = access_count + 1,
    last_accessed = NOW()
  WHERE
    query_hash = v_query_hash
    AND model = p_model
    AND (p_user_id IS NULL OR user_id = p_user_id OR user_id IS NULL)
    AND expires_at > NOW()
  RETURNING
    cached_responses_simple.id,
    cached_responses_simple.response,
    cached_responses_simple.tokens_used,
    cached_responses_simple.cost_saved;
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
  v_id UUID;
BEGIN
  -- Calculate hash
  v_query_hash := encode(sha256(p_query::bytea), 'hex');

  -- Try to update existing entry first
  UPDATE cached_responses_simple
  SET
    response = p_response,
    access_count = access_count + 1,
    last_accessed = NOW(),
    expires_at = NOW() + INTERVAL '30 days'
  WHERE
    query_hash = v_query_hash
    AND model = p_model
    AND (p_user_id IS NULL OR user_id = p_user_id OR user_id IS NULL)
  RETURNING id INTO v_id;

  -- If no update, insert new entry
  IF v_id IS NULL THEN
    INSERT INTO cached_responses_simple (
      query, response, model, embedding, user_id, tokens_used, cost_saved
    ) VALUES (
      p_query, p_response, p_model, p_embedding, p_user_id, p_tokens, p_cost_saved
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
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
  SELECT
    cr.id,
    cr.query,
    cr.response,
    1 - (cr.embedding <=> p_embedding) as similarity,
    cr.tokens_used,
    cr.cost_saved
  FROM cached_responses_simple cr
  WHERE
    cr.model = p_model
    AND (p_user_id IS NULL OR cr.user_id = p_user_id OR cr.user_id IS NULL)
    AND cr.expires_at > NOW()
    AND cr.embedding IS NOT NULL
    AND 1 - (cr.embedding <=> p_embedding) > p_threshold
  ORDER BY cr.embedding <=> p_embedding
  LIMIT p_limit;

  -- Update access count for returned entries
  UPDATE cached_responses_simple
  SET
    access_count = access_count + 1,
    last_accessed = NOW()
  WHERE id IN (SELECT id FROM cached_responses_simple cr
               WHERE cr.model = p_model
               AND (p_user_id IS NULL OR cr.user_id = p_user_id OR cr.user_id IS NULL)
               AND cr.expires_at > NOW()
               AND cr.embedding IS NOT NULL
               AND 1 - (cr.embedding <=> p_embedding) > p_threshold
               ORDER BY cr.embedding <=> p_embedding
               LIMIT p_limit);
END;
$$;

-- Promote hot cache to main table
CREATE OR REPLACE FUNCTION promote_hot_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  promoted_count INTEGER;
BEGIN
  -- Move hot cache to main table
  WITH promoted AS (
    INSERT INTO cached_responses_simple (
      query, response, model, embedding, user_id, tokens_used
    )
    SELECT
      query,
      response,
      model,
      embedding,
      user_id,
      tokens_used
    FROM hot_cache
    WHERE created_at < NOW() - INTERVAL '1 minute'
    ON CONFLICT (query_hash, model, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      access_count = cached_responses_simple.access_count + 1,
      last_accessed = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO promoted_count FROM promoted;

  -- Clean hot cache
  DELETE FROM hot_cache WHERE created_at < NOW() - INTERVAL '1 minute';

  RETURN promoted_count;
END;
$$;

-- Automatic cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired entries
  DELETE FROM cached_responses_simple
  WHERE expires_at < NOW()
    OR (access_count < 2 AND created_at < NOW() - INTERVAL '7 days')
    OR (access_count < 5 AND created_at < NOW() - INTERVAL '30 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Vacuum analyze the table
  ANALYZE cached_responses_simple;

  RETURN deleted_count;
END;
$$;

-- =====================================================
-- CACHE STATISTICS VIEW
-- =====================================================

CREATE OR REPLACE VIEW cache_stats AS
SELECT
  (SELECT COUNT(*) FROM cached_responses_simple) as total_entries,
  (SELECT COUNT(*) FROM hot_cache) as hot_entries,
  (SELECT COUNT(*) FROM cached_responses_simple WHERE created_at > NOW() - INTERVAL '1 hour') as new_entries_hour,
  (SELECT AVG(access_count) FROM cached_responses_simple) as avg_access_count,
  (SELECT COUNT(DISTINCT model) FROM cached_responses_simple) as unique_models,
  (SELECT SUM(cost_saved) FROM cached_responses_simple) as total_savings,
  (SELECT COUNT(*)::FLOAT / NULLIF((SELECT COUNT(*) FROM usage_tracking WHERE created_at > NOW() - INTERVAL '1 hour'), 0)
   FROM usage_tracking
   WHERE cache_hit = true AND created_at > NOW() - INTERVAL '1 hour') as hit_rate_hour;

-- =====================================================
-- MONITORING QUERIES
-- =====================================================

-- Top cached queries
CREATE OR REPLACE VIEW top_cached_queries AS
SELECT
  LEFT(query, 100) as query_preview,
  model,
  access_count,
  cost_saved,
  last_accessed,
  created_at
FROM cached_responses_simple
ORDER BY access_count DESC
LIMIT 100;

-- Cache performance by model
CREATE OR REPLACE VIEW cache_performance_by_model AS
SELECT
  model,
  COUNT(*) as cache_entries,
  AVG(access_count) as avg_access_count,
  SUM(cost_saved) as total_saved,
  MAX(last_accessed) as last_used
FROM cached_responses_simple
GROUP BY model
ORDER BY total_saved DESC;

-- =====================================================
-- EXAMPLE USAGE
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

-- 3. Insert new cache entry
SELECT upsert_cache(
  'What is AI?',
  'AI is artificial intelligence...',
  'gpt-3.5-turbo',
  '[0.1, 0.2, ...]'::vector,
  NULL,  -- user_id
  150,   -- tokens
  0.30   -- cost saved
);

-- 4. Track usage
INSERT INTO usage_tracking (
  user_id, model, tokens_used, cache_hit, cache_type,
  similarity_score, cost_saved, response_time_ms
) VALUES (
  NULL, 'gpt-3.5-turbo', 150, true, 'exact',
  1.0, 0.30, 5
);
*/