-- =====================================================
-- CLEANUP UNUSED TABLES
-- Remove tables not referenced in the codebase
-- =====================================================

-- Tables found in SQL files but NOT used in codebase:
-- - cache_analytics (not used)
-- - cached_responses_simple (not used)
-- - hot_cache (not used)
-- - user_sessions (not used - we use Supabase auth sessions)

-- Drop unused tables (if they exist)
DROP TABLE IF EXISTS cache_analytics CASCADE;
DROP TABLE IF EXISTS cached_responses_simple CASCADE;
DROP TABLE IF EXISTS hot_cache CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Drop old partitions if not needed
-- Keep only recent partitions
DROP TABLE IF EXISTS cached_responses_2024_12 CASCADE;

-- Clean up any orphaned views
DROP VIEW IF EXISTS cache_health CASCADE;
DROP VIEW IF EXISTS cache_performance CASCADE;
DROP VIEW IF EXISTS user_dashboard CASCADE;

-- Show remaining tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;