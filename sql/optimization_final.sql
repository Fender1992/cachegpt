-- =====================================================
-- COMPLETE CACHE OPTIMIZATION - FINAL WORKING VERSION
-- =====================================================

-- STEP 1: Enable Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS vector;

-- Check if pg_cron is available
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  IMPORTANT: pg_cron extension is not enabled!';
    RAISE NOTICE '';
    RAISE NOTICE 'Please enable it manually:';
    RAISE NOTICE '1. Go to Supabase Dashboard';
    RAISE NOTICE '2. Navigate to Database → Extensions';
    RAISE NOTICE '3. Search for "pg_cron"';
    RAISE NOTICE '4. Toggle it ON';
    RAISE NOTICE '';
  ELSE
    RAISE NOTICE '✅ pg_cron extension is enabled';
  END IF;
END $$;

-- =====================================================
-- STEP 2: FIX COMPRESSION
-- =====================================================

DO $$
BEGIN
  -- Drop broken functions
  DROP FUNCTION IF EXISTS compress_large_responses() CASCADE;
  DROP FUNCTION IF EXISTS get_response(UUID) CASCADE;
  DROP FUNCTION IF EXISTS compress_text(TEXT) CASCADE;
  DROP FUNCTION IF EXISTS decompress_text(BYTEA) CASCADE;

  -- Remove compression columns if they exist
  ALTER TABLE cached_responses DROP COLUMN IF EXISTS response_compressed CASCADE;
  ALTER TABLE cached_responses DROP COLUMN IF EXISTS is_compressed CASCADE;

  -- Configure PostgreSQL to auto-compress large text fields
  ALTER TABLE cached_responses ALTER COLUMN response SET STORAGE EXTENDED;
  ALTER TABLE cached_responses ALTER COLUMN query SET STORAGE EXTENDED;

  RAISE NOTICE '✅ Compression fixed - using PostgreSQL TOAST auto-compression';
END $$;

-- =====================================================
-- STEP 3: PARTITION MAINTENANCE
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

-- Create partitions now
SELECT create_monthly_partitions();

-- =====================================================
-- STEP 4: ADD TRACKING COLUMNS
-- =====================================================

DO $$
BEGIN
  -- Add tracking columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cached_responses' AND column_name = 'last_accessed'
  ) THEN
    ALTER TABLE cached_responses ADD COLUMN last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cached_responses' AND column_name = 'access_count'
  ) THEN
    ALTER TABLE cached_responses ADD COLUMN access_count INTEGER DEFAULT 1;
  END IF;

  RAISE NOTICE '✅ Tracking columns added';
END $$;

-- =====================================================
-- STEP 5: CLEANUP FUNCTIONS
-- =====================================================

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

  -- Delete short responses
  DELETE FROM cached_responses
  WHERE LENGTH(response) < 100
    AND created_at < CURRENT_DATE - INTERVAL '30 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted short responses', rows_deleted;

  -- Remove duplicates
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
  RETURN QUERY SELECT 'Removed duplicates', rows_deleted;

  -- Delete very old data
  DELETE FROM cached_responses
  WHERE created_at < CURRENT_DATE - INTERVAL '365 days';
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  total_deleted := total_deleted + rows_deleted;
  RETURN QUERY SELECT 'Deleted > 1 year old', rows_deleted;

  RETURN QUERY SELECT 'Total cleaned', total_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 6: ARCHIVAL
-- =====================================================

-- Create archive table
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

-- Configure compression for archive
ALTER TABLE cached_responses_archive ALTER COLUMN response SET STORAGE EXTENDED;
ALTER TABLE cached_responses_archive ALTER COLUMN query SET STORAGE EXTENDED;

-- Archive function
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
  RETURN rows_archived;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 7: FIX SIMILARITY FUNCTIONS
-- =====================================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS match_cache_entries CASCADE;
DROP FUNCTION IF EXISTS match_responses CASCADE;

-- Create match_cache_entries function
CREATE FUNCTION match_cache_entries(
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

-- Create match_responses as an alias
CREATE FUNCTION match_responses(
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
-- STEP 8: MONITORING
-- =====================================================

CREATE OR REPLACE VIEW cache_health AS
SELECT
  pg_size_pretty(pg_total_relation_size('cached_responses')) as cache_size,
  COUNT(*) as total_entries,
  COUNT(DISTINCT query_hash) as unique_queries,
  AVG(access_count)::NUMERIC(10,2) as avg_access_count,
  ROUND(
    COUNT(CASE WHEN access_count > 1 THEN 1 END)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as hit_rate_percent,
  COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as entries_last_week
FROM cached_responses;

-- =====================================================
-- STEP 9: SCHEDULE JOBS (IF PG_CRON EXISTS)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove old schedules safely
    BEGIN
      PERFORM cron.unschedule('create-monthly-partitions');
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      PERFORM cron.unschedule('weekly-cache-cleanup');
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      PERFORM cron.unschedule('archive-old-data');
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Schedule new jobs
    PERFORM cron.schedule(
      'create-monthly-partitions',
      '1 0 1 * *',
      'SELECT create_monthly_partitions();'
    );

    PERFORM cron.schedule(
      'weekly-cache-cleanup',
      '0 2 * * 0',
      'SELECT * FROM auto_cleanup_cache();'
    );

    PERFORM cron.schedule(
      'archive-old-data',
      '0 3 15 * *',
      'SELECT archive_valuable_old_data();'
    );

    RAISE NOTICE '✅ Scheduled jobs created';
  ELSE
    RAISE NOTICE '⚠️  pg_cron not enabled - run these manually:';
    RAISE NOTICE '  Monthly: SELECT create_monthly_partitions();';
    RAISE NOTICE '  Weekly: SELECT * FROM auto_cleanup_cache();';
    RAISE NOTICE '  Monthly: SELECT archive_valuable_old_data();';
  END IF;
END $$;

-- =====================================================
-- STEP 10: RUN INITIAL OPTIMIZATION
-- =====================================================

DO $$
DECLARE
  cleanup_result RECORD;
  archive_count INTEGER;
BEGIN
  RAISE NOTICE '🚀 Running initial optimization...';

  -- Create partitions
  PERFORM create_monthly_partitions();
  RAISE NOTICE '✅ Partitions created';

  -- Run cleanup
  FOR cleanup_result IN SELECT * FROM auto_cleanup_cache() LOOP
    RAISE NOTICE '  - %: % rows', cleanup_result.action, cleanup_result.rows_affected;
  END LOOP;

  -- Archive old data
  archive_count := archive_valuable_old_data();
  RAISE NOTICE '  - Archived: % rows', archive_count;

  -- Analyze tables
  ANALYZE cached_responses;
  IF EXISTS (SELECT 1 FROM cached_responses_archive LIMIT 1) THEN
    ANALYZE cached_responses_archive;
  END IF;

  RAISE NOTICE '✅ Tables analyzed';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Optimization complete!';
END $$;

-- =====================================================
-- SHOW FINAL STATUS
-- =====================================================

SELECT * FROM cache_health;

-- Show schedule status
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    THEN 'Automated maintenance: ACTIVE ✅'
    ELSE 'Automated maintenance: MANUAL MODE ⚠️ (enable pg_cron for automation)'
  END as status;