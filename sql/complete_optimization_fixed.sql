-- =====================================================
-- COMPLETE CACHE OPTIMIZATION (FIXED VERSION)
-- No external compression functions needed
-- Uses PostgreSQL's built-in TOAST compression
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- 1. AUTOMATIC PARTITION MAINTENANCE
-- =====================================================

CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  FOR i IN 0..2 LOOP
    partition_date := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::INTERVAL);
    partition_name := 'cached_responses_' || TO_CHAR(partition_date, 'YYYY_MM');

    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE tablename = partition_name
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

-- Schedule monthly partition creation
SELECT cron.schedule(
  'create-monthly-partitions',
  '1 0 1 * *',
  'SELECT create_monthly_partitions();'
);

-- Create partitions immediately
SELECT create_monthly_partitions();

-- =====================================================
-- 2. AUTOMATIC CLEANUP
-- =====================================================

-- Add columns if missing
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 1;

CREATE OR REPLACE FUNCTION auto_cleanup_cache()
RETURNS TABLE(
  action TEXT,
  rows_affected INTEGER
) AS $$
DECLARE
  rows_deleted INTEGER;
  total_deleted INTEGER := 0;
BEGIN
  -- Delete old single-use queries
  DELETE FROM cached_responses
  WHERE access_count = 1
    AND created_at < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted old single-use queries', rows_deleted;

  -- Delete short responses (likely errors)
  DELETE FROM cached_responses
  WHERE LENGTH(response) < 100
    AND created_at < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted short/error responses', rows_deleted;

  -- Remove duplicates keeping most accessed
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

  -- Delete very old data
  DELETE FROM cached_responses
  WHERE created_at < CURRENT_DATE - INTERVAL '365 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted entries > 1 year old', rows_deleted;

  RETURN QUERY SELECT 'Total rows cleaned', total_deleted;

  -- Vacuum to reclaim space
  VACUUM ANALYZE cached_responses;
END;
$$ LANGUAGE plpgsql;

-- Schedule weekly cleanup
SELECT cron.schedule(
  'weekly-cache-cleanup',
  '0 2 * * 0',
  'SELECT * FROM auto_cleanup_cache();'
);

-- =====================================================
-- 3. POSTGRESQL TOAST COMPRESSION (AUTOMATIC)
-- =====================================================

-- Configure columns for optimal compression
-- EXTENDED = compress and store out-of-line
ALTER TABLE cached_responses ALTER COLUMN response SET STORAGE EXTENDED;
ALTER TABLE cached_responses ALTER COLUMN query SET STORAGE EXTENDED;

-- Function to analyze storage and compression
CREATE OR REPLACE FUNCTION analyze_storage_efficiency()
RETURNS TABLE(
  metric TEXT,
  value TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'Total Rows', COUNT(*)::TEXT
  FROM cached_responses;

  RETURN QUERY
  SELECT 'Table Size', pg_size_pretty(pg_total_relation_size('cached_responses'));

  RETURN QUERY
  SELECT 'Average Response Size', pg_size_pretty(AVG(LENGTH(response))::BIGINT)
  FROM cached_responses;

  RETURN QUERY
  SELECT 'Large Responses (>2KB)', COUNT(*)::TEXT || ' (auto-compressed by TOAST)'
  FROM cached_responses
  WHERE LENGTH(response) > 2048;

  RETURN QUERY
  SELECT 'Storage Efficiency',
    ROUND(100.0 - (
      pg_total_relation_size('cached_responses')::NUMERIC /
      NULLIF(SUM(LENGTH(query) + LENGTH(response))::NUMERIC, 0) * 100
    ), 2) || '% compression'
  FROM cached_responses;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. ARCHIVAL STRATEGY
-- =====================================================

CREATE TABLE IF NOT EXISTS cached_responses_archive (
  id UUID PRIMARY KEY,
  query_hash VARCHAR(64),
  query TEXT,
  response TEXT,
  model VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER,
  last_accessed TIMESTAMP WITH TIME ZONE
);

-- Optimize archive table for compression
ALTER TABLE cached_responses_archive ALTER COLUMN response SET STORAGE EXTENDED;
ALTER TABLE cached_responses_archive ALTER COLUMN query SET STORAGE EXTENDED;

CREATE OR REPLACE FUNCTION archive_valuable_old_data()
RETURNS INTEGER AS $$
DECLARE
  rows_archived INTEGER;
BEGIN
  WITH to_archive AS (
    DELETE FROM cached_responses
    WHERE created_at < CURRENT_DATE - INTERVAL '6 months'
      AND access_count > 5
    RETURNING *
  )
  INSERT INTO cached_responses_archive
  SELECT
    id, query_hash, query, response,
    model, created_at, access_count, last_accessed
  FROM to_archive;

  GET DIAGNOSTICS rows_archived = ROW_COUNT;

  VACUUM cached_responses;
  RETURN rows_archived;
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly archival
SELECT cron.schedule(
  'archive-old-data',
  '0 3 15 * *',
  'SELECT archive_valuable_old_data();'
);

-- =====================================================
-- 5. IMPROVED SIMILARITY SEARCH
-- =====================================================

-- Better similarity function with access tracking
CREATE OR REPLACE FUNCTION match_cache_entries(
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
  -- Update access tracking for matches
  WITH matches AS (
    SELECT
      cr.id,
      cr.query,
      cr.response,
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

  -- Return matches
  RETURN QUERY
  SELECT
    cr.id,
    cr.query,
    cr.response,
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

-- Create alias for compatibility
CREATE OR REPLACE FUNCTION match_responses(
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
  RETURN QUERY
  SELECT * FROM match_cache_entries(
    query_embedding,
    match_threshold,
    match_count,
    model_filter
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. CACHE PRE-WARMING
-- =====================================================

CREATE TABLE IF NOT EXISTS popular_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,
  request_count INTEGER DEFAULT 1,
  last_requested TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_cached BOOLEAN DEFAULT FALSE,
  UNIQUE(query_hash)
);

CREATE OR REPLACE FUNCTION track_query_popularity(p_query TEXT)
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

CREATE OR REPLACE FUNCTION get_queries_to_warm(limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
  query TEXT,
  request_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT pq.query, pq.request_count
  FROM popular_queries pq
  LEFT JOIN cached_responses cr ON pq.query_hash = cr.query_hash
  WHERE cr.id IS NULL
    AND pq.request_count > 3
    AND pq.last_requested > CURRENT_DATE - INTERVAL '7 days'
  ORDER BY pq.request_count DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. MONITORING DASHBOARD
-- =====================================================

CREATE OR REPLACE VIEW cache_health AS
SELECT
  pg_size_pretty(pg_total_relation_size('cached_responses')) as cache_size,
  pg_size_pretty(pg_total_relation_size('cached_responses_archive')) as archive_size,
  COUNT(*) as total_entries,
  COUNT(DISTINCT query_hash) as unique_queries,
  AVG(access_count)::NUMERIC(10,2) as avg_access_count,
  ROUND(
    COUNT(CASE WHEN access_count > 1 THEN 1 END)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as cache_hit_rate_percent,
  COUNT(CASE WHEN LENGTH(response) > 2048 THEN 1 END) as compressed_via_toast,
  COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as entries_last_week,
  COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as entries_last_month
FROM cached_responses;

-- Performance metrics view
CREATE OR REPLACE VIEW cache_performance AS
WITH stats AS (
  SELECT
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as new_entries,
    AVG(LENGTH(response)) as avg_size
  FROM cached_responses
  WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE_TRUNC('day', created_at)
)
SELECT
  day,
  new_entries,
  pg_size_pretty(avg_size::BIGINT) as avg_response_size,
  SUM(new_entries) OVER (ORDER BY day) as cumulative_entries
FROM stats
ORDER BY day DESC;

-- =====================================================
-- 8. INITIAL OPTIMIZATION RUN
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Starting cache optimization...';

  -- Create partitions
  PERFORM create_monthly_partitions();
  RAISE NOTICE '✅ Partitions created';

  -- Run cleanup
  PERFORM auto_cleanup_cache();
  RAISE NOTICE '✅ Initial cleanup completed';

  -- Archive old data
  PERFORM archive_valuable_old_data();
  RAISE NOTICE '✅ Old data archived';

  -- Analyze tables
  ANALYZE cached_responses;
  ANALYZE cached_responses_archive;
  RAISE NOTICE '✅ Tables analyzed';

  RAISE NOTICE '';
  RAISE NOTICE '🎉 Cache optimization complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Scheduled Jobs:';
  RAISE NOTICE '  • Partition creation: Monthly (1st at 12:01 AM)';
  RAISE NOTICE '  • Cache cleanup: Weekly (Sunday at 2 AM)';
  RAISE NOTICE '  • Data archival: Monthly (15th at 3 AM)';
  RAISE NOTICE '';
  RAISE NOTICE 'Run SELECT * FROM cache_health; to see current status';
END $$;

-- Show final status
SELECT * FROM cache_health;