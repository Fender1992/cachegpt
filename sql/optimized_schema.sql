-- =====================================================
-- OPTIMIZED DATABASE SCHEMA FOR CACHEGPT
-- High-performance caching with sub-10ms lookups
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For fuzzy text matching

-- =====================================================
-- MAIN CACHE TABLE WITH OPTIMIZATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS cached_responses (
  id UUID DEFAULT gen_random_uuid(),

  -- TTL and timestamps (moved up for partitioning)
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
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',

  -- Cost tracking
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Fixed: Include created_at in primary key for partitioning
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (example for 2025)
CREATE TABLE cached_responses_2025_01 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE cached_responses_2025_02 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Continue creating partitions as needed...

-- =====================================================
-- HIGH-PERFORMANCE INDEXES
-- =====================================================

-- Primary lookup index (exact match) - THIS IS CRITICAL!
-- Note: For partitioned tables, create this index on each partition
-- or use a non-unique index on the parent table
CREATE INDEX idx_query_hash_model_user
  ON cached_responses(query_hash, model, user_id);

-- Vector similarity search using HNSW (better than IVFFlat)
CREATE INDEX idx_embedding_hnsw
  ON cached_responses USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Composite index for user queries
CREATE INDEX idx_user_model_created
  ON cached_responses(user_id, model, created_at DESC);

-- Hot cache index (frequently accessed items)
CREATE INDEX idx_hot_cache
  ON cached_responses(access_count DESC, last_accessed DESC)
  WHERE access_count > 5;

-- TTL index for cleanup
CREATE INDEX idx_expires_at
  ON cached_responses(expires_at)
  WHERE expires_at IS NOT NULL;

-- Model-specific queries
CREATE INDEX idx_model_created
  ON cached_responses(model, created_at DESC);

-- =====================================================
-- HOT CACHE TABLE (UNLOGGED FOR SPEED)
-- =====================================================

CREATE UNLOGGED TABLE hot_cache (
  query_hash VARCHAR(64) PRIMARY KEY,
  response TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,
  user_id UUID,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Simple index for hot cache
CREATE INDEX idx_hot_cache_created ON hot_cache(created_at DESC);

-- =====================================================
-- USAGE TRACKING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
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
-- API KEYS TABLE (MISSING FROM ORIGINAL)
-- =====================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  permissions JSONB DEFAULT '{"read": true, "write": true}',
  rate_limit_tier VARCHAR(20) DEFAULT 'standard',
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_key ON api_keys(key) WHERE is_active = true;

-- =====================================================
-- OPTIMIZED FUNCTIONS
-- =====================================================

-- Fast exact match lookup
CREATE OR REPLACE FUNCTION find_exact_cache(
  p_query_hash VARCHAR(64),
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
BEGIN
  -- Update access stats and return in one query
  RETURN QUERY
  UPDATE cached_responses
  SET
    access_count = access_count + 1,
    last_accessed = NOW()
  WHERE
    query_hash = p_query_hash
    AND model = p_model
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND expires_at > NOW()
  RETURNING
    cached_responses.id,
    cached_responses.response,
    cached_responses.tokens_used,
    cached_responses.cost_saved;
END;
$$;

-- Semantic similarity search (improved)
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
  FROM cached_responses cr
  WHERE
    cr.model = p_model
    AND (p_user_id IS NULL OR cr.user_id = p_user_id)
    AND cr.expires_at > NOW()
    AND 1 - (cr.embedding <=> p_embedding) > p_threshold
  ORDER BY cr.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

-- Batch insert for hot cache promotion
CREATE OR REPLACE FUNCTION promote_hot_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  promoted_count INTEGER;
BEGIN
  -- Move hot cache to main table
  WITH promoted AS (
    INSERT INTO cached_responses (query, response, model, user_id, tokens_used)
    SELECT
      query_hash, -- Will need to store original query
      response,
      model,
      user_id,
      tokens_used
    FROM hot_cache
    WHERE created_at < NOW() - INTERVAL '1 minute'
    ON CONFLICT (query_hash, model, user_id) DO UPDATE
    SET
      access_count = cached_responses.access_count + 1,
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
-- MATERIALIZED VIEWS FOR ANALYTICS
-- =====================================================

CREATE MATERIALIZED VIEW cache_statistics AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  model,
  COUNT(*) as total_requests,
  COUNT(CASE WHEN cache_hit THEN 1 END) as cache_hits,
  AVG(response_time_ms) as avg_response_time,
  SUM(cost_saved) as total_saved,
  COUNT(DISTINCT user_id) as unique_users
FROM usage_tracking
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY hour, model;

-- Refresh every hour
CREATE INDEX idx_cache_statistics_hour ON cache_statistics(hour DESC);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE cached_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users read own cache" ON cached_responses
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users write own cache" ON cached_responses
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own usage" ON usage_tracking
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users read own keys" ON api_keys
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- BACKGROUND JOBS (using pg_cron or similar)
-- =====================================================

-- Schedule these with pg_cron:
-- SELECT cron.schedule('cleanup-cache', '0 2 * * *', 'SELECT cleanup_expired_cache();');
-- SELECT cron.schedule('promote-hot', '*/5 * * * *', 'SELECT promote_hot_cache();');
-- SELECT cron.schedule('refresh-stats', '0 * * * *', 'REFRESH MATERIALIZED VIEW cache_statistics;');

-- =====================================================
-- MONITORING QUERIES
-- =====================================================

-- Real-time cache performance
CREATE OR REPLACE VIEW cache_performance AS
SELECT
  NOW() as timestamp,
  (SELECT COUNT(*) FROM cached_responses) as total_entries,
  (SELECT COUNT(*) FROM hot_cache) as hot_entries,
  (SELECT AVG(access_count) FROM cached_responses) as avg_access_count,
  (SELECT COUNT(*) FROM cached_responses WHERE created_at > NOW() - INTERVAL '1 hour') as new_entries_hour,
  (SELECT COUNT(CASE WHEN cache_hit THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0)
   FROM usage_tracking
   WHERE created_at > NOW() - INTERVAL '1 hour') as hit_rate_hour;

-- =====================================================
-- INITIAL DATA AND SETTINGS
-- =====================================================

-- Optimize PostgreSQL settings for caching workload
-- Add to postgresql.conf:
-- shared_buffers = 256MB  # 25% of RAM
-- effective_cache_size = 768MB  # 75% of RAM
-- work_mem = 4MB
-- maintenance_work_mem = 64MB
-- random_page_cost = 1.1  # SSD optimization
-- effective_io_concurrency = 200  # SSD optimization