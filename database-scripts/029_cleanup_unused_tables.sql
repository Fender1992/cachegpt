-- Database Cleanup Script: Remove Unused Tables
-- Created: September 29, 2025
-- Purpose: Clean up deprecated and unused tables from earlier iterations
--
-- IMPORTANT: Review this list before running!
-- Make sure you have backups before executing this script.
-- ============================================================

-- Start transaction for safety
BEGIN;

-- ============================================================
-- 1. Drop deprecated usage tracking tables
-- ============================================================

-- Old usage logs table
DROP TABLE IF EXISTS public.usage_logs CASCADE;

-- Old usage tracking table
DROP TABLE IF EXISTS public.usage_tracking CASCADE;

-- Cache statistics table
DROP TABLE IF EXISTS public.cache_stats CASCADE;

-- ============================================================
-- 2. Drop old Claude-specific tables
-- ============================================================

-- Claude conversations (replaced by unified conversations table)
DROP TABLE IF EXISTS public.claude_conversations CASCADE;

-- Claude messages (replaced by unified messages table)
DROP TABLE IF EXISTS public.claude_messages CASCADE;

-- Claude sessions (deprecated)
DROP TABLE IF EXISTS public.user_claude_sessions CASCADE;

-- Conversation summaries (not used)
DROP TABLE IF EXISTS public.conversation_summaries CASCADE;

-- ============================================================
-- 3. Drop redundant API key tables
-- ============================================================

-- Old API keys table (replaced by user_provider_credentials)
DROP TABLE IF EXISTS public.api_keys CASCADE;

-- Redundant user API keys table
DROP TABLE IF EXISTS public.user_api_keys CASCADE;

-- ============================================================
-- 4. Drop unused feature tables
-- ============================================================

-- Popular queries tracking (never implemented)
DROP TABLE IF EXISTS public.popular_queries CASCADE;

-- CLI auth sessions (if not using CLI authentication)
-- CAUTION: Only drop if you're not using CLI authentication
-- DROP TABLE IF EXISTS public.cli_auth_sessions CASCADE;

-- ============================================================
-- 5. Drop unused ranking/caching tables (if not planning to use)
-- ============================================================

-- Query rankings (not fully implemented)
DROP TABLE IF EXISTS public.query_rankings CASCADE;

-- Ranking features (partially implemented)
-- CAUTION: Only drop if not planning to use ranking system
-- DROP TABLE IF EXISTS public.ranking_features CASCADE;

-- ============================================================
-- 6. Drop archive and partition tables (if not using partitioning)
-- ============================================================

-- Archive tables
DROP TABLE IF EXISTS public.cached_responses_archive CASCADE;
DROP TABLE IF EXISTS public.cached_responses_archive_2024_01 CASCADE;
DROP TABLE IF EXISTS public.cached_responses_archive_2024_02 CASCADE;

-- Monthly partition tables (if not using partitioning)
-- CAUTION: Only drop these if you're not using table partitioning
-- DROP TABLE IF EXISTS public.cached_responses_2025_09 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2025_10 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2025_11 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2025_12 CASCADE;
-- DROP TABLE IF EXISTS public.cached_responses_2026_01 CASCADE;

-- ============================================================
-- 7. Drop duplicate tables
-- ============================================================

-- Drop profiles table if it exists (duplicate of user_profiles)
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- 8. Drop associated views that reference removed tables
-- ============================================================

-- Drop views that might reference deleted tables
DROP VIEW IF EXISTS public.usage_stats CASCADE;
DROP VIEW IF EXISTS public.cache_performance CASCADE;
DROP VIEW IF EXISTS public.claude_session_stats CASCADE;

-- ============================================================
-- 9. Clean up orphaned sequences
-- ============================================================

-- Drop sequences that might be orphaned
DROP SEQUENCE IF EXISTS public.usage_logs_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.api_keys_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.claude_conversations_id_seq CASCADE;

-- ============================================================
-- 10. Clean up orphaned functions related to dropped tables
-- ============================================================

-- Drop functions that might be related to deleted tables
DROP FUNCTION IF EXISTS update_usage_logs_timestamp() CASCADE;
DROP FUNCTION IF EXISTS calculate_cache_stats() CASCADE;
DROP FUNCTION IF EXISTS update_claude_session() CASCADE;

-- ============================================================
-- Verification: List remaining tables
-- ============================================================

-- This will show you what tables remain after cleanup
DO $$
BEGIN
    RAISE NOTICE 'Cleanup complete. Remaining tables:';
    RAISE NOTICE '=========================================';
END $$;

-- Show remaining tables
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================
-- COMMIT or ROLLBACK
-- ============================================================

-- Review the output above. If everything looks good:
-- COMMIT;

-- If something went wrong or you want to cancel:
-- ROLLBACK;

-- NOTE: This script runs in a transaction.
-- You must manually run COMMIT to apply changes or ROLLBACK to cancel.
-- This gives you a chance to review what will be removed.