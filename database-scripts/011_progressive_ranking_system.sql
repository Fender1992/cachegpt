-- =====================================================
-- PROGRESSIVE QUERY RANKING SYSTEM
-- Start simple, scale up as needed
-- =====================================================

-- PHASE 1: FOUNDATION (Implement Now)
-- =====================================================

-- Add basic columns with future expansion in mind
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS popularity_score DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ranking_version INTEGER DEFAULT 1,  -- Track which algorithm version
ADD COLUMN IF NOT EXISTS ranking_metadata JSONB DEFAULT '{}', -- Store additional metrics
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'standard', -- Pre-add tier support
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Indexes for current and future use
CREATE INDEX IF NOT EXISTS idx_cached_responses_popularity ON cached_responses(popularity_score DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_cached_responses_tier ON cached_responses(tier) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_cached_responses_archived ON cached_responses(is_archived, archived_at);

-- =====================================================
-- VERSIONED SCORING FUNCTIONS
-- Can switch between algorithms without schema changes
-- =====================================================

-- V1: Simple scoring (current implementation)
CREATE OR REPLACE FUNCTION calculate_popularity_score_v1(
  p_access_count INTEGER,
  p_created_at TIMESTAMP WITH TIME ZONE,
  p_last_accessed TIMESTAMP WITH TIME ZONE,
  p_cost_saved DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  v_score DECIMAL;
  v_age_days INTEGER;
  v_recency_days INTEGER;
BEGIN
  v_age_days := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 86400;
  v_recency_days := EXTRACT(EPOCH FROM (NOW() - p_last_accessed)) / 86400;

  -- Simple weighted scoring
  v_score := LEAST(100, LN(p_access_count + 1) * 20) * 0.3  -- Access frequency
           + (100 * EXP(-v_recency_days / 7)) * 0.3           -- Recency
           + GREATEST(0, 100 - v_age_days) * 0.2              -- Age penalty
           + LEAST(100, p_cost_saved * 1000) * 0.2;           -- Economic value

  RETURN ROUND(v_score, 4);
END;
$$ LANGUAGE plpgsql;

-- V2: Advanced scoring (ready for future)
CREATE OR REPLACE FUNCTION calculate_popularity_score_v2(
  p_cached_response_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_score DECIMAL;
  v_metadata JSONB;
  v_hourly_pattern DECIMAL[];
  v_trend_score DECIMAL;
BEGIN
  -- Get extended metadata
  SELECT ranking_metadata INTO v_metadata
  FROM cached_responses
  WHERE id = p_cached_response_id;

  -- Calculate trend score from metadata
  v_trend_score := COALESCE(
    (v_metadata->>'accesses_last_hour')::INTEGER * 100 +
    (v_metadata->>'accesses_last_24h')::INTEGER * 10 +
    (v_metadata->>'accesses_last_7d')::INTEGER,
    0
  );

  -- Combine with V1 scoring as base
  SELECT calculate_popularity_score_v1(
    access_count, created_at, last_accessed, cost_saved
  ) INTO v_score
  FROM cached_responses
  WHERE id = p_cached_response_id;

  -- Add trend component (will activate when metadata is populated)
  v_score := v_score * 0.7 + (v_trend_score * 0.3);

  RETURN ROUND(v_score, 4);
END;
$$ LANGUAGE plpgsql;

-- Master function that routes to correct version
CREATE OR REPLACE FUNCTION calculate_popularity_score(
  p_cached_response_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_version INTEGER;
  v_record RECORD;
BEGIN
  -- Get the record and its ranking version
  SELECT * INTO v_record
  FROM cached_responses
  WHERE id = p_cached_response_id;

  -- Route to appropriate scoring function
  CASE v_record.ranking_version
    WHEN 1 THEN
      RETURN calculate_popularity_score_v1(
        v_record.access_count,
        v_record.created_at,
        v_record.last_accessed,
        v_record.cost_saved
      );
    WHEN 2 THEN
      RETURN calculate_popularity_score_v2(p_cached_response_id);
    ELSE
      -- Default to V1
      RETURN calculate_popularity_score_v1(
        v_record.access_count,
        v_record.created_at,
        v_record.last_accessed,
        v_record.cost_saved
      );
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TIER ASSIGNMENT (Pre-built for future)
-- =====================================================

CREATE OR REPLACE FUNCTION assign_tier(p_score DECIMAL)
RETURNS VARCHAR AS $$
BEGIN
  RETURN CASE
    WHEN p_score >= 80 THEN 'hot'
    WHEN p_score >= 60 THEN 'warm'
    WHEN p_score >= 40 THEN 'cool'
    WHEN p_score >= 20 THEN 'cold'
    ELSE 'frozen'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- METADATA COLLECTION (For future ML features)
-- =====================================================

CREATE OR REPLACE FUNCTION update_ranking_metadata(
  p_cached_response_id UUID
) RETURNS VOID AS $$
DECLARE
  v_metadata JSONB;
BEGIN
  -- Collect time-based access patterns
  WITH access_patterns AS (
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30d,
      COUNT(DISTINCT user_id) as unique_users,
      AVG(CASE WHEN metadata->>'response_time' IS NOT NULL
               THEN (metadata->>'response_time')::INTEGER
               ELSE NULL END) as avg_response_time
    FROM usage
    WHERE metadata->>'cache_id' = p_cached_response_id::TEXT
  )
  SELECT jsonb_build_object(
    'accesses_last_hour', last_hour,
    'accesses_last_24h', last_24h,
    'accesses_last_7d', last_7d,
    'accesses_last_30d', last_30d,
    'unique_users', unique_users,
    'avg_response_time', avg_response_time,
    'last_updated', NOW()
  ) INTO v_metadata
  FROM access_patterns;

  -- Update the metadata
  UPDATE cached_responses
  SET ranking_metadata = COALESCE(ranking_metadata, '{}'::JSONB) || v_metadata
  WHERE id = p_cached_response_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FLEXIBLE ARCHIVAL FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION archive_unpopular_queries(
  p_score_threshold DECIMAL DEFAULT 20,
  p_days_inactive INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 1000,
  p_use_tiers BOOLEAN DEFAULT false  -- Future feature flag
) RETURNS TABLE (
  archived_count INTEGER,
  by_tier JSONB
) AS $$
DECLARE
  v_archived_count INTEGER := 0;
  v_tier_counts JSONB := '{}'::JSONB;
  v_query_id UUID;
BEGIN
  -- Update scores first
  UPDATE cached_responses
  SET
    popularity_score = calculate_popularity_score(id),
    tier = assign_tier(popularity_score),  -- Pre-assign tiers for future
    last_score_update = NOW()
  WHERE is_archived = false
    AND (last_score_update < NOW() - INTERVAL '1 day' OR last_score_update IS NULL);

  IF p_use_tiers THEN
    -- Future: Archive by tier
    FOR v_query_id IN
      SELECT id
      FROM cached_responses
      WHERE is_archived = false
        AND tier = 'frozen'
        AND last_accessed < NOW() - INTERVAL '1 day' * p_days_inactive
      ORDER BY popularity_score ASC
      LIMIT p_batch_size
    LOOP
      UPDATE cached_responses
      SET is_archived = true,
          archived_at = NOW(),
          ranking_metadata = ranking_metadata ||
            jsonb_build_object('archive_reason', 'tier_frozen')
      WHERE id = v_query_id;

      v_archived_count := v_archived_count + 1;
    END LOOP;
  ELSE
    -- Current: Simple threshold
    FOR v_query_id IN
      SELECT id
      FROM cached_responses
      WHERE is_archived = false
        AND popularity_score < p_score_threshold
        AND last_accessed < NOW() - INTERVAL '1 day' * p_days_inactive
      ORDER BY popularity_score ASC
      LIMIT p_batch_size
    LOOP
      UPDATE cached_responses
      SET is_archived = true,
          archived_at = NOW(),
          ranking_metadata = ranking_metadata ||
            jsonb_build_object('archive_reason', 'below_threshold')
      WHERE id = v_query_id;

      v_archived_count := v_archived_count + 1;
    END LOOP;
  END IF;

  -- Collect tier statistics
  SELECT jsonb_object_agg(tier, count)
  INTO v_tier_counts
  FROM (
    SELECT tier, COUNT(*) as count
    FROM cached_responses
    WHERE archived_at > NOW() - INTERVAL '1 minute'
    GROUP BY tier
  ) t;

  RETURN QUERY SELECT v_archived_count, v_tier_counts;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FEATURE FLAGS TABLE (Control system behavior)
-- =====================================================

CREATE TABLE IF NOT EXISTS ranking_features (
  feature_name VARCHAR(50) PRIMARY KEY,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default features
INSERT INTO ranking_features (feature_name, is_enabled, config) VALUES
  ('use_v2_scoring', false, '{"min_queries": 10000}'::JSONB),
  ('use_tier_archival', false, '{"enabled_after_queries": 50000}'::JSONB),
  ('collect_metadata', false, '{"sample_rate": 0.1}'::JSONB),
  ('predictive_caching', false, '{"algorithm": "time_series"}'::JSONB)
ON CONFLICT (feature_name) DO NOTHING;

-- =====================================================
-- MIGRATION PATH FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION upgrade_ranking_system(
  p_target_version INTEGER
) RETURNS TEXT AS $$
DECLARE
  v_current_queries INTEGER;
  v_message TEXT;
BEGIN
  -- Check current scale
  SELECT COUNT(*) INTO v_current_queries FROM cached_responses;

  CASE p_target_version
    WHEN 2 THEN
      -- Enable V2 scoring
      UPDATE cached_responses SET ranking_version = 2;
      UPDATE ranking_features SET is_enabled = true WHERE feature_name = 'use_v2_scoring';
      UPDATE ranking_features SET is_enabled = true WHERE feature_name = 'collect_metadata';
      v_message := 'Upgraded to V2 scoring with metadata collection';

    WHEN 3 THEN
      -- Enable tier-based archival
      UPDATE ranking_features SET is_enabled = true WHERE feature_name = 'use_tier_archival';
      -- Create archive table if needed
      CREATE TABLE IF NOT EXISTS cached_responses_archive (
        LIKE cached_responses INCLUDING ALL
      );
      v_message := 'Enabled tier-based archival with separate archive table';

    WHEN 4 THEN
      -- Enable predictive features
      UPDATE ranking_features SET is_enabled = true WHERE feature_name = 'predictive_caching';
      v_message := 'Enabled predictive caching features';

    ELSE
      v_message := 'Unknown version';
  END CASE;

  RETURN v_message || ' (Current queries: ' || v_current_queries || ')';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MONITORING & ANALYTICS
-- =====================================================

CREATE OR REPLACE VIEW ranking_dashboard AS
SELECT
  -- Current state
  COUNT(*) as total_queries,
  COUNT(*) FILTER (WHERE NOT is_archived) as active_queries,
  COUNT(*) FILTER (WHERE is_archived) as archived_queries,

  -- Tier distribution
  COUNT(*) FILTER (WHERE tier = 'hot' AND NOT is_archived) as hot_queries,
  COUNT(*) FILTER (WHERE tier = 'warm' AND NOT is_archived) as warm_queries,
  COUNT(*) FILTER (WHERE tier = 'cool' AND NOT is_archived) as cool_queries,
  COUNT(*) FILTER (WHERE tier = 'cold' AND NOT is_archived) as cold_queries,
  COUNT(*) FILTER (WHERE tier = 'frozen' AND NOT is_archived) as frozen_queries,

  -- Performance metrics
  AVG(popularity_score) FILTER (WHERE NOT is_archived) as avg_score,
  MAX(popularity_score) FILTER (WHERE NOT is_archived) as max_score,
  MIN(popularity_score) FILTER (WHERE NOT is_archived) as min_score,

  -- Economic impact
  SUM(cost_saved) as total_cost_saved,
  SUM(cost_saved) FILTER (WHERE tier = 'hot') as hot_cost_saved,

  -- System info
  MAX(ranking_version) as max_ranking_version,
  (SELECT COUNT(*) FROM ranking_features WHERE is_enabled = true) as enabled_features
FROM cached_responses;

-- Function to get system readiness for next phase
CREATE OR REPLACE FUNCTION check_upgrade_readiness()
RETURNS TABLE (
  current_phase INTEGER,
  ready_for_next BOOLEAN,
  recommendation TEXT,
  metrics JSONB
) AS $$
DECLARE
  v_total_queries INTEGER;
  v_daily_queries INTEGER;
  v_current_phase INTEGER := 1;
  v_ready BOOLEAN := false;
  v_recommendation TEXT;
BEGIN
  -- Get metrics
  SELECT COUNT(*) INTO v_total_queries FROM cached_responses;
  SELECT COUNT(*) INTO v_daily_queries
  FROM cached_responses
  WHERE created_at > NOW() - INTERVAL '24 hours';

  -- Determine current phase
  IF EXISTS (SELECT 1 FROM ranking_features WHERE feature_name = 'predictive_caching' AND is_enabled) THEN
    v_current_phase := 4;
  ELSIF EXISTS (SELECT 1 FROM ranking_features WHERE feature_name = 'use_tier_archival' AND is_enabled) THEN
    v_current_phase := 3;
  ELSIF EXISTS (SELECT 1 FROM ranking_features WHERE feature_name = 'use_v2_scoring' AND is_enabled) THEN
    v_current_phase := 2;
  ELSE
    v_current_phase := 1;
  END IF;

  -- Check readiness for next phase
  CASE v_current_phase
    WHEN 1 THEN
      v_ready := v_total_queries >= 10000 OR v_daily_queries >= 500;
      v_recommendation := CASE
        WHEN v_ready THEN 'Ready for V2 scoring. Run: SELECT upgrade_ranking_system(2);'
        ELSE 'Continue with V1. Need ' || (10000 - v_total_queries) || ' more queries.'
      END;
    WHEN 2 THEN
      v_ready := v_total_queries >= 50000 OR v_daily_queries >= 2000;
      v_recommendation := CASE
        WHEN v_ready THEN 'Ready for tiered archival. Run: SELECT upgrade_ranking_system(3);'
        ELSE 'Continue with V2. Need ' || (50000 - v_total_queries) || ' more queries.'
      END;
    WHEN 3 THEN
      v_ready := v_total_queries >= 100000 OR v_daily_queries >= 5000;
      v_recommendation := CASE
        WHEN v_ready THEN 'Ready for predictive caching. Run: SELECT upgrade_ranking_system(4);'
        ELSE 'Continue with tiered system.'
      END;
    ELSE
      v_recommendation := 'System at maximum capability.';
  END CASE;

  RETURN QUERY SELECT
    v_current_phase,
    v_ready,
    v_recommendation,
    jsonb_build_object(
      'total_queries', v_total_queries,
      'daily_queries', v_daily_queries,
      'archived_percentage', (
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_archived) / COUNT(*), 2)
        FROM cached_responses
      )
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SCHEDULED JOBS (Progressive activation)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Basic job (always runs)
    PERFORM cron.schedule(
      'update-basic-rankings',
      '0 */6 * * *',
      'UPDATE cached_responses ' ||
      'SET popularity_score = calculate_popularity_score(id), ' ||
      'tier = assign_tier(popularity_score), ' ||
      'last_score_update = NOW() ' ||
      'WHERE is_archived = false ' ||
      'AND (last_score_update < NOW() - INTERVAL ''6 hours'' OR last_score_update IS NULL)'
    );

    -- Archive job (always runs but respects feature flags)
    PERFORM cron.schedule(
      'archive-queries',
      '0 3 * * *',
      'SELECT archived_count, by_tier FROM archive_unpopular_queries(' ||
      '20, 30, 1000, ' ||
      '(SELECT is_enabled FROM ranking_features WHERE feature_name = ''use_tier_archival''))'
    );

    -- Metadata collection (only if enabled)
    PERFORM cron.schedule(
      'collect-metadata',
      '0 */2 * * *',
      'DO $inner$ ' ||
      'BEGIN ' ||
      'IF (SELECT is_enabled FROM ranking_features WHERE feature_name = ''collect_metadata'') THEN ' ||
      'PERFORM update_ranking_metadata(id) ' ||
      'FROM cached_responses ' ||
      'WHERE NOT is_archived ' ||
      'AND popularity_score > 40 ' ||
      'ORDER BY RANDOM() ' ||
      'LIMIT 100; ' ||
      'END IF; ' ||
      'END $inner$;'
    );
  END IF;
EXCEPTION
  WHEN others THEN
    -- pg_cron not available, just note it
    RAISE NOTICE 'pg_cron extension not available - skipping scheduled job creation';
END $$;

-- Grant permissions
GRANT SELECT ON ranking_dashboard TO authenticated;
GRANT SELECT ON ranking_features TO authenticated;
GRANT EXECUTE ON FUNCTION check_upgrade_readiness() TO authenticated;

SELECT 'Progressive ranking system installed. Check readiness with: SELECT * FROM check_upgrade_readiness();' as status;