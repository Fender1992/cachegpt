-- =====================================================
-- INITIAL RANKING SETUP AND FIRST RUN
-- Run this after installing the progressive ranking system
-- =====================================================

-- 1. Calculate initial scores for all existing queries
UPDATE cached_responses
SET
  popularity_score = calculate_popularity_score_v1(
    access_count,
    created_at,
    last_accessed,
    cost_saved
  ),
  tier = assign_tier(popularity_score),
  last_score_update = NOW()
WHERE is_archived = false;

-- 2. Show current distribution
WITH tier_summary AS (
  SELECT
    tier,
    COUNT(*) as query_count,
    ROUND(AVG(popularity_score), 2) as avg_score,
    ROUND(AVG(access_count), 1) as avg_accesses,
    ROUND(SUM(cost_saved)::NUMERIC, 2) as total_savings,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400), 1) as avg_days_inactive
  FROM cached_responses
  WHERE NOT is_archived
  GROUP BY tier
)
SELECT
  tier,
  query_count,
  avg_score,
  avg_accesses,
  avg_days_inactive,
  total_savings,
  CASE
    WHEN tier = 'frozen' AND avg_days_inactive > 30 THEN 'Archive candidate'
    WHEN tier = 'cold' AND avg_days_inactive > 30 THEN 'Monitor closely'
    WHEN tier IN ('hot', 'warm') THEN 'Keep active'
    ELSE 'Standard'
  END as recommendation
FROM tier_summary
ORDER BY
  CASE tier
    WHEN 'hot' THEN 1
    WHEN 'warm' THEN 2
    WHEN 'cool' THEN 3
    WHEN 'cold' THEN 4
    WHEN 'frozen' THEN 5
  END;

-- 3. Show archival candidates
SELECT
  COUNT(*) as queries_to_archive,
  ROUND(SUM(cost_saved)::NUMERIC, 2) as archived_value,
  ROUND(AVG(popularity_score), 2) as avg_score,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400), 1) as avg_days_inactive
FROM cached_responses
WHERE NOT is_archived
  AND popularity_score < 20
  AND last_accessed < NOW() - INTERVAL '30 days';

-- 4. Check system readiness
SELECT * FROM check_upgrade_readiness();

-- 5. Show feature flags status
SELECT
  feature_name,
  is_enabled,
  CASE
    WHEN feature_name = 'use_v2_scoring' THEN
      'Advanced scoring with metadata (needs 10k+ queries)'
    WHEN feature_name = 'use_tier_archival' THEN
      'Separate archive table (needs 50k+ queries)'
    WHEN feature_name = 'collect_metadata' THEN
      'Track access patterns for ML (can enable anytime)'
    WHEN feature_name = 'predictive_caching' THEN
      'AI-powered predictions (needs 100k+ queries)'
  END as description,
  config
FROM ranking_features
ORDER BY feature_name;

-- 6. Get overall stats
SELECT * FROM get_ranking_stats();