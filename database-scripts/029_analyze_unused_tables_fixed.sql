-- Database Analysis Script: Identify Unused Tables (Fixed)
-- Created: September 29, 2025
-- Purpose: Analyze and report on potentially unused tables
-- ============================================================

-- This script is READ-ONLY and will not delete anything.
-- It will help you understand what tables exist and their usage.

-- ============================================================
-- 1. List all tables with their sizes and row counts
-- ============================================================

WITH table_info AS (
    SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = schemaname AND table_name = tablename) as column_count
    FROM pg_tables
    WHERE schemaname = 'public'
),
row_counts AS (
    SELECT
        schemaname,
        tablename,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        last_vacuum,
        last_autovacuum
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
)
SELECT
    ti.tablename as "Table Name",
    ti.table_size as "Size",
    COALESCE(rc.row_count, 0) as "Row Count",
    ti.column_count as "Columns",
    CASE
        WHEN ti.tablename IN (
            'usage_logs', 'usage_tracking', 'cache_stats', 'claude_conversations',
            'claude_messages', 'user_claude_sessions', 'conversation_summaries',
            'api_keys', 'user_api_keys', 'popular_queries', 'query_rankings',
            'cached_responses_archive', 'cached_responses_archive_2024_01',
            'cached_responses_archive_2024_02', 'profiles'
        ) THEN 'UNUSED - Can be dropped'
        WHEN ti.tablename IN (
            'cli_auth_sessions', 'ranking_features'
        ) THEN 'POSSIBLY UNUSED - Review before dropping'
        WHEN ti.tablename LIKE 'cached_responses_2%' THEN 'PARTITION - Keep if using partitioning'
        ELSE 'IN USE - Keep'
    END as "Status",
    CASE
        WHEN rc.last_vacuum IS NOT NULL OR rc.last_autovacuum IS NOT NULL THEN
            'Last vacuumed: ' || COALESCE(rc.last_vacuum::text, rc.last_autovacuum::text)
        ELSE 'Never vacuumed'
    END as "Maintenance"
FROM table_info ti
LEFT JOIN row_counts rc ON ti.schemaname = rc.schemaname AND ti.tablename = rc.tablename
ORDER BY ti.size_bytes DESC;