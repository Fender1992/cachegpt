-- =====================================================
-- LONG-TERM DATA RETENTION STRATEGY FOR CACHEGPT
-- =====================================================

-- 1. AUTOMATIC PARTITION MANAGEMENT
-- Create partitions automatically for next 3 months
CREATE OR REPLACE FUNCTION auto_create_partitions()
RETURNS void AS $$
DECLARE
  i INTEGER;
  partition_date DATE;
  partition_name TEXT;
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
      RAISE NOTICE 'Created partition %', partition_name;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly: SELECT cron.schedule('create-partitions', '0 0 1 * *', 'SELECT auto_create_partitions();');

-- =====================================================
-- 2. DATA RETENTION POLICIES
-- =====================================================

-- Archive old responses (move to compressed storage)
CREATE TABLE IF NOT EXISTS cached_responses_archive (
  id UUID PRIMARY KEY,
  query_hash VARCHAR(64),
  response_compressed BYTEA, -- Compressed with pg_compress
  model VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER,
  last_accessed TIMESTAMP WITH TIME ZONE
);

-- Function to archive old data (>90 days)
CREATE OR REPLACE FUNCTION archive_old_responses()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- Move rarely accessed old data to archive
  WITH to_archive AS (
    DELETE FROM cached_responses
    WHERE created_at < CURRENT_DATE - INTERVAL '90 days'
      AND last_accessed < CURRENT_DATE - INTERVAL '30 days'
      AND access_count < 5
    RETURNING *
  )
  INSERT INTO cached_responses_archive (
    id, query_hash, response_compressed, model,
    created_at, access_count, last_accessed
  )
  SELECT
    id,
    query_hash,
    compress(response::bytea), -- Compress response
    model,
    created_at,
    access_count,
    last_accessed
  FROM to_archive;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. SMART CLEANUP STRATEGIES
-- =====================================================

-- Delete duplicates keeping most accessed
CREATE OR REPLACE FUNCTION deduplicate_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY query_hash, model
             ORDER BY access_count DESC, created_at DESC
           ) as rn
    FROM cached_responses
  )
  DELETE FROM cached_responses
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Delete low-value cache entries
CREATE OR REPLACE FUNCTION cleanup_low_value_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cached_responses
  WHERE
    -- Old and never accessed again
    (created_at < CURRENT_DATE - INTERVAL '180 days' AND access_count = 1)
    OR
    -- Very old regardless of access
    (created_at < CURRENT_DATE - INTERVAL '365 days')
    OR
    -- Short responses that aren't valuable
    (LENGTH(response) < 50 AND created_at < CURRENT_DATE - INTERVAL '30 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. MONITORING & METRICS
-- =====================================================

-- Cache effectiveness metrics
CREATE OR REPLACE VIEW cache_metrics AS
SELECT
  COUNT(*) as total_entries,
  COUNT(DISTINCT query_hash) as unique_queries,
  AVG(access_count) as avg_access_count,
  SUM(access_count) as total_hits,
  pg_size_pretty(pg_total_relation_size('cached_responses')) as table_size,
  AVG(LENGTH(response)) as avg_response_length,
  COUNT(*) FILTER (WHERE access_count > 1) as reused_entries,
  COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '7 days') as recent_entries
FROM cached_responses;

-- Storage by partition
CREATE OR REPLACE VIEW partition_sizes AS
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE tablename LIKE 'cached_responses_%'
ORDER BY tablename;

-- =====================================================
-- 5. SCHEDULED MAINTENANCE JOBS
-- =====================================================

-- Main cleanup function to run weekly
CREATE OR REPLACE FUNCTION weekly_maintenance()
RETURNS TABLE(
  task TEXT,
  result INTEGER
) AS $$
BEGIN
  -- Create future partitions
  PERFORM auto_create_partitions();

  -- Deduplicate
  RETURN QUERY SELECT 'Duplicates removed', deduplicate_cache();

  -- Archive old data
  RETURN QUERY SELECT 'Responses archived', archive_old_responses();

  -- Clean low-value cache
  RETURN QUERY SELECT 'Low-value entries removed', cleanup_low_value_cache();

  -- Vacuum analyze for performance
  ANALYZE cached_responses;

  -- Drop old empty partitions (>6 months)
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE tablename LIKE 'cached_responses_20%'
      AND tablename < 'cached_responses_' || TO_CHAR(CURRENT_DATE - INTERVAL '6 months', 'YYYY_MM')
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I', r.tablename);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule weekly: SELECT cron.schedule('weekly-maintenance', '0 2 * * 0', 'SELECT * FROM weekly_maintenance();');

-- =====================================================
-- 6. EMERGENCY SPACE RECOVERY
-- =====================================================

-- When running out of space
CREATE OR REPLACE FUNCTION emergency_cleanup(
  target_reduction_percent INTEGER DEFAULT 30
)
RETURNS TABLE(
  action TEXT,
  freed_space TEXT
) AS $$
DECLARE
  initial_size BIGINT;
  final_size BIGINT;
BEGIN
  SELECT pg_total_relation_size('cached_responses') INTO initial_size;

  -- Aggressive cleanup
  DELETE FROM cached_responses
  WHERE access_count = 1
    AND created_at < CURRENT_DATE - INTERVAL '7 days';

  -- Remove all duplicates
  PERFORM deduplicate_cache();

  -- Drop old partitions
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE tablename LIKE 'cached_responses_20%'
      AND tablename < 'cached_responses_' || TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY_MM')
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
  END LOOP;

  VACUUM FULL cached_responses;

  SELECT pg_total_relation_size('cached_responses') INTO final_size;

  RETURN QUERY SELECT
    'Emergency cleanup completed',
    pg_size_pretty(initial_size - final_size);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. INTELLIGENT CACHE SCORING
-- =====================================================

-- Add cache value score
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS cache_value_score FLOAT
GENERATED ALWAYS AS (
  -- Higher score = more valuable to keep
  (access_count * 10.0) +
  (1.0 / (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_accessed)) / 86400.0 + 1)) +
  (LENGTH(response) / 100.0)
) STORED;

CREATE INDEX IF NOT EXISTS idx_cache_value_score
ON cached_responses(cache_value_score DESC);

-- Function to keep only top N valuable entries
CREATE OR REPLACE FUNCTION keep_top_cache_entries(
  max_entries INTEGER DEFAULT 100000
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY cache_value_score DESC) as rank
    FROM cached_responses
  )
  DELETE FROM cached_responses
  WHERE id IN (
    SELECT id FROM ranked WHERE rank > max_entries
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. USAGE PATTERNS & RECOMMENDATIONS
-- =====================================================

CREATE OR REPLACE VIEW usage_patterns AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as queries,
  COUNT(DISTINCT query_hash) as unique_queries,
  AVG(LENGTH(response)) as avg_response_size,
  SUM(CASE WHEN access_count > 1 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as reuse_rate
FROM cached_responses
WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;