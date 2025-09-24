-- =====================================================
-- QUERY POPULARITY RANKING AND ARCHIVAL SYSTEM
-- Implements a smart ranking system to identify and archive unpopular queries
-- =====================================================

-- Option 1: SIMPLE SCORING SYSTEM
-- =====================================================
-- Adds a popularity score to cached_responses table

ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS popularity_score DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_cached_responses_popularity ON cached_responses(popularity_score DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_cached_responses_archived ON cached_responses(is_archived, archived_at);

-- Function to calculate popularity score
CREATE OR REPLACE FUNCTION calculate_popularity_score(
  p_access_count INTEGER,
  p_created_at TIMESTAMP WITH TIME ZONE,
  p_last_accessed TIMESTAMP WITH TIME ZONE,
  p_cost_saved DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  v_score DECIMAL;
  v_age_days INTEGER;
  v_recency_days INTEGER;
  v_age_weight DECIMAL := 0.2;
  v_recency_weight DECIMAL := 0.3;
  v_access_weight DECIMAL := 0.3;
  v_cost_weight DECIMAL := 0.2;
BEGIN
  -- Calculate age in days
  v_age_days := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 86400;

  -- Calculate recency in days
  v_recency_days := EXTRACT(EPOCH FROM (NOW() - p_last_accessed)) / 86400;

  -- Score components (all normalized to 0-100)
  -- 1. Access frequency score (logarithmic scale)
  v_score := LEAST(100, LN(p_access_count + 1) * 20) * v_access_weight;

  -- 2. Recency score (exponential decay)
  v_score := v_score + (100 * EXP(-v_recency_days / 7)) * v_recency_weight;

  -- 3. Age penalty (older queries get lower scores)
  v_score := v_score + GREATEST(0, 100 - v_age_days) * v_age_weight;

  -- 4. Economic value (cost saved)
  v_score := v_score + LEAST(100, p_cost_saved * 1000) * v_cost_weight;

  RETURN ROUND(v_score, 4);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Option 2: TIERED ARCHIVAL SYSTEM
-- =====================================================

-- Create archive table with partitioning support
CREATE TABLE IF NOT EXISTS cached_responses_archive (
  LIKE cached_responses INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitions for archived data (monthly)
CREATE TABLE IF NOT EXISTS cached_responses_archive_2024_01
PARTITION OF cached_responses_archive
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS cached_responses_archive_2024_02
PARTITION OF cached_responses_archive
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Continue creating partitions as needed...

-- =====================================================
-- Option 3: SMART RANKING WITH MACHINE LEARNING FEATURES
-- =====================================================

-- Create a comprehensive ranking table
CREATE TABLE IF NOT EXISTS query_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cached_response_id UUID REFERENCES cached_responses(id) ON DELETE CASCADE,

  -- Basic metrics
  total_accesses INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  avg_response_time_ms DECIMAL(10,2),

  -- Time-based metrics
  accesses_last_24h INTEGER DEFAULT 0,
  accesses_last_7d INTEGER DEFAULT 0,
  accesses_last_30d INTEGER DEFAULT 0,

  -- Economic metrics
  total_cost_saved DECIMAL(12,6) DEFAULT 0,
  total_tokens_saved INTEGER DEFAULT 0,

  -- Scoring
  popularity_score DECIMAL(10,4) DEFAULT 0,
  quality_score DECIMAL(10,4) DEFAULT 0,  -- Based on user feedback if available
  composite_score DECIMAL(10,4) DEFAULT 0,

  -- Ranking tier
  tier VARCHAR(20) DEFAULT 'standard' CHECK (tier IN ('hot', 'warm', 'cool', 'cold', 'frozen')),

  -- Timestamps
  last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(cached_response_id)
);

CREATE INDEX IF NOT EXISTS idx_query_rankings_composite ON query_rankings(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_query_rankings_tier ON query_rankings(tier);

-- =====================================================
-- RANKING CALCULATION FUNCTIONS
-- =====================================================

-- Advanced scoring function with decay factors
CREATE OR REPLACE FUNCTION calculate_advanced_popularity_score(
  p_cached_response_id UUID
) RETURNS TABLE (
  popularity_score DECIMAL,
  tier VARCHAR,
  should_archive BOOLEAN
) AS $$
DECLARE
  v_record RECORD;
  v_score DECIMAL;
  v_tier VARCHAR;
  v_should_archive BOOLEAN := false;
BEGIN
  -- Get all metrics for the cached response
  SELECT
    cr.*,
    COALESCE(COUNT(DISTINCT u.user_id), 0) as unique_users,
    COALESCE(SUM(CASE WHEN u.created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0) as recent_hits
  INTO v_record
  FROM cached_responses cr
  LEFT JOIN usage u ON u.metadata->>'cache_id' = cr.id::text
  WHERE cr.id = p_cached_response_id
  GROUP BY cr.id;

  -- Calculate weighted score
  v_score := 0;

  -- Recent activity (40% weight)
  v_score := v_score + (v_record.recent_hits * 10) * 0.4;

  -- Total usage (30% weight)
  v_score := v_score + (LN(v_record.access_count + 1) * 5) * 0.3;

  -- Economic value (20% weight)
  v_score := v_score + (v_record.cost_saved * 100) * 0.2;

  -- Unique users (10% weight)
  v_score := v_score + (v_record.unique_users * 2) * 0.1;

  -- Apply time decay
  v_score := v_score * EXP(-EXTRACT(EPOCH FROM (NOW() - v_record.last_accessed)) / (86400 * 7));

  -- Determine tier
  v_tier := CASE
    WHEN v_score >= 80 THEN 'hot'
    WHEN v_score >= 60 THEN 'warm'
    WHEN v_score >= 40 THEN 'cool'
    WHEN v_score >= 20 THEN 'cold'
    ELSE 'frozen'
  END;

  -- Determine if should archive
  v_should_archive := (v_tier = 'frozen' AND v_record.last_accessed < NOW() - INTERVAL '30 days');

  RETURN QUERY SELECT v_score, v_tier, v_should_archive;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ARCHIVAL JOB FUNCTIONS
-- =====================================================

-- Main archival function
CREATE OR REPLACE FUNCTION archive_unpopular_queries(
  p_score_threshold DECIMAL DEFAULT 20,
  p_days_inactive INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 1000
) RETURNS INTEGER AS $$
DECLARE
  v_archived_count INTEGER := 0;
  v_query_id UUID;
BEGIN
  -- Update all popularity scores first
  UPDATE cached_responses
  SET popularity_score = calculate_popularity_score(
    access_count,
    created_at,
    last_accessed,
    cost_saved
  ),
  last_score_update = NOW()
  WHERE is_archived = false
    AND (last_score_update < NOW() - INTERVAL '1 day' OR last_score_update IS NULL);

  -- Archive queries below threshold
  FOR v_query_id IN
    SELECT id
    FROM cached_responses
    WHERE is_archived = false
      AND popularity_score < p_score_threshold
      AND last_accessed < NOW() - INTERVAL '1 day' * p_days_inactive
    ORDER BY popularity_score ASC
    LIMIT p_batch_size
  LOOP
    -- Mark as archived
    UPDATE cached_responses
    SET is_archived = true,
        archived_at = NOW()
    WHERE id = v_query_id;

    v_archived_count := v_archived_count + 1;
  END LOOP;

  RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MONITORING VIEWS
-- =====================================================

-- View for query distribution by tier
CREATE OR REPLACE VIEW query_tier_distribution AS
SELECT
  CASE
    WHEN popularity_score >= 80 THEN 'hot'
    WHEN popularity_score >= 60 THEN 'warm'
    WHEN popularity_score >= 40 THEN 'cool'
    WHEN popularity_score >= 20 THEN 'cold'
    ELSE 'frozen'
  END as tier,
  COUNT(*) as query_count,
  AVG(access_count) as avg_accesses,
  SUM(cost_saved) as total_cost_saved,
  AVG(EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400) as avg_days_inactive
FROM cached_responses
WHERE is_archived = false
GROUP BY 1
ORDER BY 1;

-- View for archival candidates
CREATE OR REPLACE VIEW archival_candidates AS
SELECT
  id,
  query,
  model,
  access_count,
  popularity_score,
  EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400 as days_inactive,
  cost_saved,
  created_at
FROM cached_responses
WHERE is_archived = false
  AND popularity_score < 20
  AND last_accessed < NOW() - INTERVAL '30 days'
ORDER BY popularity_score ASC, last_accessed ASC;

-- =====================================================
-- SCHEDULED JOBS
-- =====================================================

-- Create scheduled job for ranking updates (runs every 6 hours)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Update rankings every 6 hours
    PERFORM cron.schedule(
      'update-query-rankings',
      '0 */6 * * *',
      $$UPDATE cached_responses
        SET popularity_score = calculate_popularity_score(
          access_count, created_at, last_accessed, cost_saved
        ),
        last_score_update = NOW()
        WHERE is_archived = false$$
    );

    -- Archive unpopular queries daily at 3 AM
    PERFORM cron.schedule(
      'archive-unpopular-queries',
      '0 3 * * *',
      'SELECT archive_unpopular_queries(20, 30, 1000);'
    );
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_cron not available - manual scheduling required';
END $$;

-- =====================================================
-- REPORTING FUNCTIONS
-- =====================================================

-- Function to get ranking statistics
CREATE OR REPLACE FUNCTION get_ranking_stats()
RETURNS TABLE (
  total_queries INTEGER,
  active_queries INTEGER,
  archived_queries INTEGER,
  hot_queries INTEGER,
  avg_popularity_score DECIMAL,
  total_cost_saved DECIMAL,
  queries_to_archive INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_queries,
    SUM(CASE WHEN NOT is_archived THEN 1 ELSE 0 END)::INTEGER as active_queries,
    SUM(CASE WHEN is_archived THEN 1 ELSE 0 END)::INTEGER as archived_queries,
    SUM(CASE WHEN popularity_score >= 80 AND NOT is_archived THEN 1 ELSE 0 END)::INTEGER as hot_queries,
    AVG(CASE WHEN NOT is_archived THEN popularity_score ELSE NULL END) as avg_popularity_score,
    SUM(cost_saved) as total_cost_saved,
    SUM(CASE
      WHEN popularity_score < 20
        AND last_accessed < NOW() - INTERVAL '30 days'
        AND NOT is_archived
      THEN 1 ELSE 0
    END)::INTEGER as queries_to_archive
  FROM cached_responses;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT ON query_tier_distribution TO authenticated;
GRANT SELECT ON archival_candidates TO authenticated;
GRANT EXECUTE ON FUNCTION get_ranking_stats() TO authenticated;

-- Output success message
SELECT 'Query ranking and archival system installed successfully' as status;