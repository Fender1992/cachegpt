-- =====================================================
-- PARTITIONED CACHE TABLE WITH PROPER CONSTRAINTS
-- PostgreSQL requires partition key in all unique constraints
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing table if needed (be careful in production!)
-- DROP TABLE IF EXISTS cached_responses CASCADE;

-- Create the partitioned table with created_at in primary key
CREATE TABLE IF NOT EXISTS cached_responses (
  -- Primary key components
  id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

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

  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',

  -- Cost tracking
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- CRITICAL: Include created_at in primary key for partitioning
  CONSTRAINT cached_responses_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for recent months
CREATE TABLE IF NOT EXISTS cached_responses_2024_12 PARTITION OF cached_responses
  FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS cached_responses_2025_01 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS cached_responses_2025_02 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS cached_responses_2025_03 PARTITION OF cached_responses
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Create indexes on each partition
-- Note: Cannot create unique indexes on parent partitioned table
-- Must create on each partition individually or use non-unique indexes

-- Non-unique index for query hash lookups (will be very fast anyway)
CREATE INDEX IF NOT EXISTS idx_cached_query_hash_model
  ON cached_responses (query_hash, model, user_id);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_cached_embedding
  ON cached_responses USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_cached_user_model_created
  ON cached_responses (user_id, model, created_at DESC);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_cached_expires_at
  ON cached_responses (expires_at)
  WHERE expires_at IS NOT NULL;

-- Hot cache index
CREATE INDEX IF NOT EXISTS idx_cached_hot
  ON cached_responses (access_count DESC, last_accessed DESC)
  WHERE access_count > 5;

-- Function to automatically create new monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  -- Calculate next month
  start_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'cached_responses_' || TO_CHAR(start_date, 'YYYY_MM');

  -- Check if partition already exists
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

-- Schedule this function to run monthly using pg_cron or similar
-- SELECT cron.schedule('create-partition', '0 0 1 * *', 'SELECT create_monthly_partition();');

-- Example: Create future partitions
SELECT create_monthly_partition();