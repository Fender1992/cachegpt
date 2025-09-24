#!/bin/bash

# CacheGPT Query Ranking Monitor
# Run this script to check ranking system status

echo "================================================"
echo "     CacheGPT Query Ranking System Monitor     "
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

echo "📊 SYSTEM READINESS CHECK"
echo "------------------------"
psql $DATABASE_URL -t -c "SELECT
    'Current Phase: ' || current_phase || E'\n' ||
    'Ready for Next: ' || CASE WHEN ready_for_next THEN '✅ YES' ELSE '❌ NO' END || E'\n' ||
    'Recommendation: ' || recommendation || E'\n' ||
    'Total Queries: ' || (metrics->>'total_queries')::TEXT || E'\n' ||
    'Daily Queries: ' || (metrics->>'daily_queries')::TEXT || E'\n' ||
    'Archived: ' || COALESCE((metrics->>'archived_percentage')::TEXT, '0') || '%'
FROM check_upgrade_readiness();"

echo ""
echo "📈 TIER DISTRIBUTION"
echo "-------------------"
psql $DATABASE_URL -c "
SELECT
    CASE tier
        WHEN 'hot' THEN '🔥 Hot'
        WHEN 'warm' THEN '🌡️ Warm'
        WHEN 'cool' THEN '❄️ Cool'
        WHEN 'cold' THEN '🧊 Cold'
        WHEN 'frozen' THEN '⛄ Frozen'
        ELSE tier
    END as \"Tier\",
    query_count as \"Queries\",
    ROUND(avg_accesses) as \"Avg Hits\",
    ROUND(total_cost_saved::NUMERIC, 2) as \"Value Saved\",
    ROUND(avg_days_inactive) as \"Days Inactive\"
FROM query_tier_distribution
ORDER BY
    CASE tier
        WHEN 'hot' THEN 1
        WHEN 'warm' THEN 2
        WHEN 'cool' THEN 3
        WHEN 'cold' THEN 4
        WHEN 'frozen' THEN 5
    END;"

echo ""
echo "🗄️ ARCHIVAL STATUS"
echo "------------------"
psql $DATABASE_URL -t -c "
SELECT
    'Candidates: ' || COUNT(*) || ' queries' || E'\n' ||
    'Total Value: $' || ROUND(SUM(cost_saved)::NUMERIC, 2) || E'\n' ||
    'Avg Score: ' || ROUND(AVG(popularity_score), 1) || E'\n' ||
    'Avg Inactive: ' || ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400), 0) || ' days'
FROM cached_responses
WHERE NOT is_archived
  AND popularity_score < 20
  AND last_accessed < NOW() - INTERVAL '30 days';"

echo ""
echo "⚙️ FEATURE FLAGS"
echo "---------------"
psql $DATABASE_URL -c "
SELECT
    feature_name as \"Feature\",
    CASE WHEN is_enabled THEN '✅' ELSE '❌' END as \"Enabled\",
    CASE
        WHEN feature_name = 'use_v2_scoring' THEN 'Phase 2'
        WHEN feature_name = 'use_tier_archival' THEN 'Phase 3'
        WHEN feature_name = 'collect_metadata' THEN 'Optional'
        WHEN feature_name = 'predictive_caching' THEN 'Phase 4'
    END as \"Phase\"
FROM ranking_features
ORDER BY feature_name;"

echo ""
echo "💡 QUICK ACTIONS"
echo "---------------"
echo "• Archive now:     psql \$DATABASE_URL -c \"SELECT * FROM archive_unpopular_queries();\""
echo "• Update scores:   psql \$DATABASE_URL -c \"UPDATE cached_responses SET popularity_score = calculate_popularity_score(id);\""
echo "• Check readiness: psql \$DATABASE_URL -c \"SELECT * FROM check_upgrade_readiness();\""
echo "• View dashboard:  psql \$DATABASE_URL -c \"SELECT * FROM ranking_dashboard;\""
echo ""

# Check for recommendations
READY=$(psql $DATABASE_URL -t -c "SELECT ready_for_next FROM check_upgrade_readiness();" | tr -d ' ')

if [ "$READY" = "t" ]; then
    echo "🎉 UPGRADE AVAILABLE!"
    echo "--------------------"
    PHASE=$(psql $DATABASE_URL -t -c "SELECT current_phase FROM check_upgrade_readiness();" | tr -d ' ')
    NEXT_PHASE=$((PHASE + 1))
    echo "You're ready to upgrade to Phase $NEXT_PHASE!"
    echo "Run: psql \$DATABASE_URL -c \"SELECT upgrade_ranking_system($NEXT_PHASE);\""
    echo ""
fi

echo "================================================"
echo "Last checked: $(date)"
echo "================================================"