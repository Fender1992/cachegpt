-- Safe Cleanup Script for Unused Tables
-- ============================================================
-- Run this AFTER reviewing the analysis results
-- This script will remove unused tables from your database

-- IMPORTANT: This runs in a transaction. You must either:
-- COMMIT; (to apply changes) or ROLLBACK; (to cancel)

BEGIN;

-- ============================================================
-- Drop unused tables (confirmed not in use by application)
-- ============================================================

-- Old usage tracking systems
DROP TABLE IF EXISTS public.usage_logs CASCADE;
DROP TABLE IF EXISTS public.usage_tracking CASCADE;
DROP TABLE IF EXISTS public.cache_stats CASCADE;

-- Old Claude-specific tables (replaced by unified system)
DROP TABLE IF EXISTS public.claude_conversations CASCADE;
DROP TABLE IF EXISTS public.claude_messages CASCADE;
DROP TABLE IF EXISTS public.user_claude_sessions CASCADE;
DROP TABLE IF EXISTS public.conversation_summaries CASCADE;

-- Redundant API key tables
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.user_api_keys CASCADE;

-- Never implemented features
DROP TABLE IF EXISTS public.popular_queries CASCADE;
DROP TABLE IF EXISTS public.query_rankings CASCADE;

-- Old archive tables
DROP TABLE IF EXISTS public.cached_responses_archive CASCADE;
DROP TABLE IF EXISTS public.cached_responses_archive_2024_01 CASCADE;
DROP TABLE IF EXISTS public.cached_responses_archive_2024_02 CASCADE;

-- Duplicate profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- Optional: Drop these only if you're sure they're not needed
-- ============================================================

-- Uncomment to drop CLI auth sessions (if not using CLI)
-- DROP TABLE IF EXISTS public.cli_auth_sessions CASCADE;

-- Uncomment to drop ranking features (if not using ranking)
-- DROP TABLE IF EXISTS public.ranking_features CASCADE;

-- Uncomment to drop partition tables (if not using partitioning)
-- DROP TABLE IF EXISTS public.cached_responses_2025_09 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2025_10 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2025_11 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2025_12 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2026_01 CASCADE;

-- ============================================================
-- Show what remains
-- ============================================================

SELECT
    'Tables remaining after cleanup:' as status;

SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================
-- FINAL STEP: Review and decide
-- ============================================================

-- If everything looks good, run:
-- COMMIT;

-- If you want to cancel, run:
-- ROLLBACK;