-- Database Analysis Script: Identify Unused Tables
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

-- ============================================================
-- 2. Show foreign key dependencies
-- ============================================================

SELECT
    'Foreign Key Dependencies' as "Section";

SELECT
    conname as "Constraint Name",
    conrelid::regclass as "Table",
    confrelid::regclass as "References Table"
FROM pg_constraint
WHERE contype = 'f'
AND (
    conrelid::regclass::text LIKE '%usage_logs%'
    OR conrelid::regclass::text LIKE '%claude_%'
    OR conrelid::regclass::text LIKE '%api_keys%'
    OR confrelid::regclass::text LIKE '%usage_logs%'
    OR confrelid::regclass::text LIKE '%claude_%'
    OR confrelid::regclass::text LIKE '%api_keys%'
);

-- ============================================================
-- 3. Show views that depend on these tables
-- ============================================================

SELECT
    'Dependent Views' as "Section";

SELECT
    v.viewname as "View Name",
    v.definition
FROM pg_views v
WHERE v.schemaname = 'public'
AND (
    v.definition LIKE '%usage_logs%'
    OR v.definition LIKE '%claude_conversations%'
    OR v.definition LIKE '%api_keys%'
    OR v.definition LIKE '%cache_stats%'
);

-- ============================================================
-- 4. Calculate total space that would be freed
-- ============================================================

SELECT
    'Space Analysis' as "Section";

WITH unused_tables AS (
    SELECT
        tablename,
        pg_total_relation_size('public.'||tablename) as size_bytes
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
        'usage_logs', 'usage_tracking', 'cache_stats', 'claude_conversations',
        'claude_messages', 'user_claude_sessions', 'conversation_summaries',
        'api_keys', 'user_api_keys', 'popular_queries', 'query_rankings',
        'cached_responses_archive', 'cached_responses_archive_2024_01',
        'cached_responses_archive_2024_02', 'profiles'
    )
)
SELECT
    COUNT(*) as "Tables to Remove",
    pg_size_pretty(SUM(size_bytes)) as "Total Space to Free",
    pg_size_pretty(AVG(size_bytes)) as "Average Table Size"
FROM unused_tables;

-- ============================================================
-- 5. Generate DROP commands (for review only)
-- ============================================================

SELECT
    'Generated DROP Commands (DO NOT RUN WITHOUT REVIEW)' as "Section";

SELECT
    'DROP TABLE IF EXISTS public.' || tablename || ' CASCADE;' as "Drop Command"
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'usage_logs', 'usage_tracking', 'cache_stats', 'claude_conversations',
    'claude_messages', 'user_claude_sessions', 'conversation_summaries',
    'api_keys', 'user_api_keys', 'popular_queries', 'query_rankings',
    'cached_responses_archive', 'cached_responses_archive_2024_01',
    'cached_responses_archive_2024_02', 'profiles'
)
ORDER BY tablename;

-- ============================================================
-- 6. Check for recent activity on potentially unused tables
-- ============================================================

SELECT
    'Recent Activity Check' as "Section";

SELECT
    schemaname || '.' || tablename as "Table",
    n_tup_ins as "Rows Inserted",
    n_tup_upd as "Rows Updated",
    n_tup_del as "Rows Deleted",
    last_vacuum as "Last Vacuum",
    last_analyze as "Last Analyze"
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND tablename IN (
    'usage_logs', 'usage_tracking', 'cache_stats', 'claude_conversations',
    'claude_messages', 'user_claude_sessions', 'conversation_summaries',
    'api_keys', 'user_api_keys', 'popular_queries', 'query_rankings',
    'cli_auth_sessions', 'ranking_features'
)
AND (n_tup_ins > 0 OR n_tup_upd > 0 OR n_tup_del > 0);

-- ============================================================
-- End of Analysis
-- ============================================================

SELECT
    'Analysis complete. Review the results above before running cleanup.' as "Status";