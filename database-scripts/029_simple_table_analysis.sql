-- Simple Table Analysis for Supabase
-- ============================================================

-- 1. List all tables with basic info
SELECT
    tablename as table_name,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

-- 2. Show which tables are likely unused (based on our code analysis)
SELECT '--- UNUSED TABLES (safe to drop) ---' as status;

SELECT
    tablename as unused_table,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size,
    'DROP TABLE IF EXISTS public.' || tablename || ' CASCADE;' as drop_command
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'usage_logs',
    'usage_tracking',
    'cache_stats',
    'claude_conversations',
    'claude_messages',
    'user_claude_sessions',
    'conversation_summaries',
    'api_keys',
    'user_api_keys',
    'popular_queries',
    'query_rankings',
    'cached_responses_archive',
    'cached_responses_archive_2024_01',
    'cached_responses_archive_2024_02',
    'profiles'
);

-- 3. Show tables that might be unused
SELECT '--- POSSIBLY UNUSED TABLES (review before dropping) ---' as status;

SELECT
    tablename as possibly_unused,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size,
    'DROP TABLE IF EXISTS public.' || tablename || ' CASCADE;' as drop_command
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'cli_auth_sessions',
    'ranking_features'
);

-- 4. Calculate total space used by unused tables
SELECT '--- SPACE ANALYSIS ---' as status;

SELECT
    COUNT(*) as unused_table_count,
    pg_size_pretty(SUM(pg_total_relation_size('public.'||tablename))) as total_space_to_free
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'usage_logs', 'usage_tracking', 'cache_stats', 'claude_conversations',
    'claude_messages', 'user_claude_sessions', 'conversation_summaries',
    'api_keys', 'user_api_keys', 'popular_queries', 'query_rankings',
    'cached_responses_archive', 'cached_responses_archive_2024_01',
    'cached_responses_archive_2024_02', 'profiles'
);

-- 5. Show actively used tables (to keep)
SELECT '--- ACTIVE TABLES (keep these) ---' as status;

SELECT
    tablename as active_table,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'user_profiles',
    'user_provider_credentials',
    'cached_responses',
    'conversations',
    'messages',
    'user_model_preferences',
    'provider_models',
    'bugs',
    'usage',
    'oauth_providers'
)
ORDER BY tablename;