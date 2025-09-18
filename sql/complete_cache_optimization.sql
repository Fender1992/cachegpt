-- =====================================================
-- COMPLETE CACHE OPTIMIZATION IMPLEMENTATION
-- Run this in Supabase SQL Editor to fix all issues
-- =====================================================

-- First, enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- 1. AUTOMATIC PARTITION MAINTENANCE
-- =====================================================

-- Function to automatically create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  -- Create partitions for next 3 months
  FOR i IN 0..2 LOOP
    partition_date := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::INTERVAL);
    partition_name := 'cached_responses_' || TO_CHAR(partition_date, 'YYYY_MM');

    -- Check if partition exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE tablename = partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF cached_responses FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        partition_date,
        partition_date + INTERVAL '1 month'
      );
      RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly partition creation (runs on 1st of each month at 12:01 AM)
SELECT cron.schedule(
  'create-monthly-partitions',
  '1 0 1 * *',
  'SELECT create_monthly_partitions();'
);

-- Create partitions for current and next 2 months immediately
SELECT create_monthly_partitions();

-- =====================================================
-- 2. AUTOMATIC CLEANUP STRATEGY
-- =====================================================

-- Add tracking columns if they don't exist
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 1;

-- Function to cleanup old and low-value data
CREATE OR REPLACE FUNCTION auto_cleanup_cache()
RETURNS TABLE(
  action TEXT,
  rows_affected INTEGER
) AS $$
DECLARE
  rows_deleted INTEGER;
  total_deleted INTEGER := 0;
BEGIN
  -- Delete single-use queries older than 90 days
  DELETE FROM cached_responses
  WHERE access_count = 1
    AND created_at < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted old single-use queries', rows_deleted;

  -- Delete short responses (likely errors) older than 30 days
  DELETE FROM cached_responses
  WHERE LENGTH(response) < 100
    AND created_at < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted short/error responses', rows_deleted;

  -- Delete duplicates, keeping the most accessed version
  WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY query_hash, model
      ORDER BY access_count DESC, created_at DESC
    ) as rn
    FROM cached_responses
  )
  DELETE FROM cached_responses
  WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Removed duplicate entries', rows_deleted;

  -- Delete anything older than 1 year regardless
  DELETE FROM cached_responses
  WHERE created_at < CURRENT_DATE - INTERVAL '365 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted entries older than 1 year', rows_deleted;

  RETURN QUERY SELECT 'Total rows cleaned up', total_deleted;
END;
$$ LANGUAGE plpgsql;

-- Schedule weekly cleanup (runs every Sunday at 2 AM)
SELECT cron.schedule(
  'weekly-cache-cleanup',
  '0 2 * * 0',
  'SELECT * FROM auto_cleanup_cache();'
);

-- =====================================================
-- 3. RESPONSE COMPRESSION
-- =====================================================

-- Add compressed column for large responses
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS response_compressed BYTEA;

ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE;

-- Function to compress large responses
CREATE OR REPLACE FUNCTION compress_large_responses()
RETURNS INTEGER AS $$
DECLARE
  rows_compressed INTEGER;
BEGIN
  WITH to_compress AS (
    UPDATE cached_responses
    SET
      response_compressed = compress(response::bytea),
      response = NULL,
      is_compressed = TRUE
    WHERE LENGTH(response) > 5000  -- Compress responses > 5KB
      AND is_compressed = FALSE
      AND response IS NOT NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO rows_compressed FROM to_compress;

  RETURN rows_compressed;
END;
$$ LANGUAGE plpgsql;

-- Function to decompress when needed
CREATE OR REPLACE FUNCTION get_response(cache_id UUID)
RETURNS TEXT AS $$
DECLARE
  result RECORD;
BEGIN
  SELECT response, response_compressed, is_compressed
  INTO result
  FROM cached_responses
  WHERE id = cache_id;

  IF result.is_compressed THEN
    RETURN convert_from(decompress(result.response_compressed), 'UTF8');
  ELSE
    RETURN result.response;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Schedule daily compression (runs at 3 AM)
SELECT cron.schedule(
  'compress-responses',
  '0 3 * * *',
  'SELECT compress_large_responses();'
);

-- =====================================================
-- 4. ARCHIVAL STRATEGY
-- =====================================================

-- Create archive table for old but valuable data
CREATE TABLE IF NOT EXISTS cached_responses_archive (
  id UUID PRIMARY KEY,
  query_hash VARCHAR(64),
  query TEXT,
  response_compressed BYTEA,
  model VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER,
  last_accessed TIMESTAMP WITH TIME ZONE
);

-- Function to archive old but frequently accessed data
CREATE OR REPLACE FUNCTION archive_valuable_old_data()
RETURNS INTEGER AS $$
DECLARE
  rows_archived INTEGER;
BEGIN
  WITH to_archive AS (
    DELETE FROM cached_responses
    WHERE created_at < CURRENT_DATE - INTERVAL '6 months'
      AND access_count > 5  -- Keep valuable data
    RETURNING *
  )
  INSERT INTO cached_responses_archive (
    id, query_hash, query, response_compressed,
    model, created_at, access_count, last_accessed
  )
  SELECT
    id, query_hash, query,
    compress(COALESCE(response, convert_from(response_compressed, 'UTF8'))::bytea),
    model, created_at, access_count, last_accessed
  FROM to_archive;

  GET DIAGNOSTICS rows_archived = ROW_COUNT;
  RETURN rows_archived;
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly archival (runs on 15th at 3 AM)
SELECT cron.schedule(
  'archive-old-data',
  '0 3 15 * *',
  'SELECT archive_valuable_old_data();'
);

-- =====================================================
-- 5. BETTER EMBEDDINGS WITH OPENAI
-- =====================================================

-- Function to generate proper OpenAI embeddings (called from application)
CREATE OR REPLACE FUNCTION update_embedding(
  cache_id UUID,
  new_embedding vector(1536)  -- OpenAI ada-002 uses 1536 dimensions
)
RETURNS void AS $$
BEGIN
  UPDATE cached_responses
  SET embedding = new_embedding
  WHERE id = cache_id;
END;
$$ LANGUAGE plpgsql;

-- Better similarity search with proper embeddings
CREATE OR REPLACE FUNCTION smart_match_responses(
  query_embedding vector,
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 5,
  model_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  query text,
  response text,
  model varchar,
  created_at timestamp with time zone,
  similarity float,
  access_count integer
) AS $$
BEGIN
  -- Update access count for returned matches
  WITH matches AS (
    SELECT
      cr.id,
      cr.query,
      CASE
        WHEN cr.is_compressed THEN convert_from(decompress(cr.response_compressed), 'UTF8')
        ELSE cr.response
      END as response,
      cr.model,
      cr.created_at,
      1 - (cr.embedding <=> query_embedding) AS similarity,
      cr.access_count
    FROM cached_responses cr
    WHERE (model_filter IS NULL OR cr.model = model_filter)
      AND 1 - (cr.embedding <=> query_embedding) > match_threshold
    ORDER BY cr.embedding <=> query_embedding
    LIMIT match_count
  )
  UPDATE cached_responses cr
  SET
    access_count = cr.access_count + 1,
    last_accessed = NOW()
  FROM matches m
  WHERE cr.id = m.id;

  -- Return the matches
  RETURN QUERY
  SELECT
    cr.id,
    cr.query,
    CASE
      WHEN cr.is_compressed THEN convert_from(decompress(cr.response_compressed), 'UTF8')
      ELSE cr.response
    END as response,
    cr.model,
    cr.created_at,
    1 - (cr.embedding <=> query_embedding) AS similarity,
    cr.access_count
  FROM cached_responses cr
  WHERE (model_filter IS NULL OR cr.model = model_filter)
    AND 1 - (cr.embedding <=> query_embedding) > match_threshold
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. CACHE PRE-WARMING
-- =====================================================

-- Table to track popular queries for pre-warming
CREATE TABLE IF NOT EXISTS popular_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,
  request_count INTEGER DEFAULT 1,
  last_requested TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_cached BOOLEAN DEFAULT FALSE,
  UNIQUE(query_hash)
);

-- Function to track query popularity
CREATE OR REPLACE FUNCTION track_query_popularity(
  p_query TEXT
)
RETURNS void AS $$
BEGIN
  INSERT INTO popular_queries (query, request_count, last_requested)
  VALUES (p_query, 1, NOW())
  ON CONFLICT (query_hash)
  DO UPDATE SET
    request_count = popular_queries.request_count + 1,
    last_requested = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get queries that should be pre-warmed
CREATE OR REPLACE FUNCTION get_queries_to_warm(
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  query TEXT,
  request_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT pq.query, pq.request_count
  FROM popular_queries pq
  LEFT JOIN cached_responses cr ON pq.query_hash = cr.query_hash
  WHERE cr.id IS NULL  -- Not yet cached
    AND pq.request_count > 3  -- Requested multiple times
    AND pq.last_requested > CURRENT_DATE - INTERVAL '7 days'
  ORDER BY pq.request_count DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. MONITORING & METRICS
-- =====================================================

-- Comprehensive cache health view
CREATE OR REPLACE VIEW cache_health AS
SELECT
  -- Storage metrics
  pg_size_pretty(pg_total_relation_size('cached_responses')) as cache_size,
  pg_size_pretty(pg_total_relation_size('cached_responses_archive')) as archive_size,

  -- Cache metrics
  COUNT(*) as total_entries,
  COUNT(DISTINCT query_hash) as unique_queries,
  AVG(access_count) as avg_access_count,

  -- Hit rate
  ROUND(
    COUNT(CASE WHEN access_count > 1 THEN 1 END)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as cache_hit_rate,

  -- Compression stats
  COUNT(CASE WHEN is_compressed THEN 1 END) as compressed_entries,

  -- Age distribution
  COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as entries_last_week,
  COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as entries_last_month

FROM cached_responses;

-- =====================================================
-- 8. RUN INITIAL OPTIMIZATION
-- =====================================================

-- Run all optimizations immediately
DO $$
BEGIN
  RAISE NOTICE 'Starting cache optimization...';

  -- Create partitions
  PERFORM create_monthly_partitions();
  RAISE NOTICE '✓ Partitions created';

  -- Run initial cleanup
  PERFORM auto_cleanup_cache();
  RAISE NOTICE '✓ Initial cleanup completed';

  -- Compress large responses
  PERFORM compress_large_responses();
  RAISE NOTICE '✓ Large responses compressed';

  -- Archive old valuable data
  PERFORM archive_valuable_old_data();
  RAISE NOTICE '✓ Old data archived';

  -- Analyze tables for query optimization
  ANALYZE cached_responses;
  ANALYZE cached_responses_archive;
  RAISE NOTICE '✓ Tables analyzed';

  RAISE NOTICE 'Cache optimization complete!';
END $$;

-- Show current status
SELECT * FROM cache_health;