-- =====================================================
-- OPTIMIZED STRATEGY FOR PAID SUPABASE PLAN
-- =====================================================
-- With 8GB storage, focus on performance over space saving

-- 1. KEEP MORE DATA
-- Increase retention periods
CREATE OR REPLACE FUNCTION paid_plan_cleanup()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Only delete truly useless data
  DELETE FROM cached_responses
  WHERE
    -- Keep everything for 1 year
    (created_at < CURRENT_DATE - INTERVAL '365 days' AND access_count = 1)
    OR
    -- Keep frequently accessed forever
    (created_at < CURRENT_DATE - INTERVAL '2 years');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 2. ENHANCED ANALYTICS
-- Track more detailed usage patterns
CREATE TABLE IF NOT EXISTS cache_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  total_queries INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  avg_response_time_ms FLOAT,
  total_tokens_saved INTEGER DEFAULT 0,
  total_cost_saved DECIMAL(10,4) DEFAULT 0,
  popular_queries JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast analytics queries
CREATE INDEX idx_analytics_date ON cache_analytics(date DESC);

-- 3. MULTI-MODEL CACHE OPTIMIZATION
-- Track performance by model
CREATE OR REPLACE VIEW model_performance AS
SELECT
  model,
  COUNT(*) as total_cached,
  AVG(access_count) as avg_reuse,
  SUM(access_count) - COUNT(*) as total_saves,
  pg_size_pretty(AVG(LENGTH(response))::BIGINT) as avg_size,
  MAX(access_count) as most_accessed
FROM cached_responses
GROUP BY model
ORDER BY total_cached DESC;

-- 4. USER-BASED QUOTAS (Optional)
-- Track usage per user
CREATE OR REPLACE VIEW user_usage AS
SELECT
  user_id,
  COUNT(*) as total_queries,
  SUM(access_count) as total_accesses,
  pg_size_pretty(SUM(LENGTH(response))::BIGINT) as total_storage,
  MAX(created_at) as last_activity
FROM cached_responses
WHERE user_id IS NOT NULL
GROUP BY user_id
ORDER BY total_queries DESC;

-- 5. INTELLIGENT CACHE WARMING
-- Pre-cache popular queries
CREATE OR REPLACE FUNCTION warm_cache_popular_queries()
RETURNS TABLE(query TEXT, times_requested INTEGER) AS $$
BEGIN
  -- Return top queries that should be pre-cached
  RETURN QUERY
  SELECT
    query,
    access_count
  FROM cached_responses
  WHERE access_count > 10
    AND last_accessed > CURRENT_DATE - INTERVAL '7 days'
  ORDER BY access_count DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- 6. ADVANCED SIMILARITY SEARCH
-- Create better indexes for vector search
DROP INDEX IF EXISTS idx_cached_embedding;
CREATE INDEX idx_cached_embedding_hnsw
  ON cached_responses USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 128); -- Higher values for better accuracy

-- 7. RESPONSE QUALITY SCORING
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 1.0;

-- Update quality based on user feedback (if implemented)
CREATE OR REPLACE FUNCTION update_quality_score(
  cache_id UUID,
  feedback_score FLOAT -- 0.0 to 1.0
)
RETURNS void AS $$
BEGIN
  UPDATE cached_responses
  SET quality_score = (quality_score * 0.7 + feedback_score * 0.3) -- Weighted average
  WHERE id = cache_id;
END;
$$ LANGUAGE plpgsql;

-- 8. CACHE PERFORMANCE MONITORING
CREATE OR REPLACE VIEW cache_performance_stats AS
WITH daily_stats AS (
  SELECT
    DATE(created_at) as day,
    COUNT(*) as new_entries,
    AVG(LENGTH(response)) as avg_response_size
  FROM cached_responses
  WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
  GROUP BY DATE(created_at)
),
hit_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE access_count > 1) as cache_hits,
    COUNT(*) as total_entries
  FROM cached_responses
)
SELECT
  (SELECT pg_size_pretty(pg_database_size(current_database()))) as database_size,
  (SELECT pg_size_pretty(pg_total_relation_size('cached_responses'))) as cache_table_size,
  (SELECT COUNT(*) FROM cached_responses) as total_entries,
  (SELECT COUNT(DISTINCT query_hash) FROM cached_responses) as unique_queries,
  (SELECT cache_hits::FLOAT / NULLIF(total_entries, 0) * 100 FROM hit_stats) as hit_rate_percent,
  (SELECT AVG(new_entries) FROM daily_stats) as avg_daily_new_entries,
  (SELECT pg_size_pretty(AVG(avg_response_size)::BIGINT) FROM daily_stats) as avg_response_size;

-- 9. SCHEDULED MAINTENANCE (LIGHTER FOR PAID PLAN)
CREATE OR REPLACE FUNCTION paid_plan_maintenance()
RETURNS void AS $$
BEGIN
  -- Just deduplicate and analyze
  PERFORM deduplicate_cache();
  ANALYZE cached_responses;

  -- Update analytics
  INSERT INTO cache_analytics (
    total_queries,
    cache_hits,
    unique_users
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE access_count > 1),
    COUNT(DISTINCT user_id)
  FROM cached_responses
  WHERE DATE(created_at) = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Schedule daily at 2 AM
-- SELECT cron.schedule('paid-maintenance', '0 2 * * *', 'SELECT paid_plan_maintenance();');

-- 10. CAPACITY PLANNING
CREATE OR REPLACE FUNCTION estimate_capacity_timeline()
RETURNS TABLE(
  metric TEXT,
  value TEXT
) AS $$
DECLARE
  current_size BIGINT;
  growth_rate FLOAT;
  days_to_full INTEGER;
BEGIN
  SELECT pg_database_size(current_database()) INTO current_size;

  -- Calculate growth rate (bytes per day) over last 30 days
  SELECT
    (pg_database_size(current_database()) -
     COALESCE(LAG(pg_database_size(current_database()), 30) OVER (), 0)) / 30.0
  INTO growth_rate
  FROM generate_series(1,1);

  -- Estimate days until 8GB
  days_to_full := CASE
    WHEN growth_rate > 0 THEN ((8::BIGINT * 1024^3 - current_size) / growth_rate)::INTEGER
    ELSE 999999
  END;

  RETURN QUERY
  SELECT 'Current Size', pg_size_pretty(current_size);

  RETURN QUERY
  SELECT 'Growth Rate', pg_size_pretty(growth_rate::BIGINT) || '/day';

  RETURN QUERY
  SELECT 'Capacity Used', ROUND(current_size * 100.0 / (8::BIGINT * 1024^3), 2) || '%';

  RETURN QUERY
  SELECT 'Days to Full', days_to_full::TEXT || ' days';

  RETURN QUERY
  SELECT 'Estimated Full Date', (CURRENT_DATE + (days_to_full || ' days')::INTERVAL)::TEXT;
END;
$$ LANGUAGE plpgsql;