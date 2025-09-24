-- =====================================================
-- PERFORMANCE OPTIMIZATION FOR CACHEGPT
-- Adds missing indexes and optimizes common queries
-- Only for tables that actually exist
-- =====================================================

-- 1. Indexes for user_profiles table (if not already created)
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_provider ON public.user_profiles(provider);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_login ON public.user_profiles(last_login_at DESC);

-- 2. Indexes for claude_conversations table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'claude_conversations') THEN
    CREATE INDEX IF NOT EXISTS idx_claude_conversations_user_id ON public.claude_conversations(auth_user_id);
    CREATE INDEX IF NOT EXISTS idx_claude_conversations_created ON public.claude_conversations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_claude_conversations_claude_user ON public.claude_conversations(claude_user_id);
  END IF;
END $$;

-- 3. Indexes for usage table
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON public.usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON public.usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON public.usage(endpoint);
-- Note: idx_usage_user_date might already exist from base schema

-- 4. Indexes for cached_responses table (main cache table)
-- These might already exist but using IF NOT EXISTS makes it safe
CREATE INDEX IF NOT EXISTS idx_cached_responses_user_id ON public.cached_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_cached_responses_model ON public.cached_responses(model);
CREATE INDEX IF NOT EXISTS idx_cached_responses_created ON public.cached_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cached_responses_expires ON public.cached_responses(expires_at);

-- 5. Indexes for user_provider_credentials (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'user_provider_credentials') THEN
    CREATE INDEX IF NOT EXISTS idx_provider_creds_user_provider ON public.user_provider_credentials(user_id, provider);
    CREATE INDEX IF NOT EXISTS idx_provider_creds_status ON public.user_provider_credentials(status);
    CREATE INDEX IF NOT EXISTS idx_provider_creds_updated ON public.user_provider_credentials(updated_at DESC);
  END IF;
END $$;

-- 6. Indexes for cli_auth_sessions (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'cli_auth_sessions') THEN
    CREATE INDEX IF NOT EXISTS idx_cli_sessions_status ON public.cli_auth_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_cli_sessions_created ON public.cli_auth_sessions(created_at DESC);
  END IF;
END $$;

-- 7. Analyze tables to update statistics (only for tables that exist)
DO $$
BEGIN
  -- Analyze each table only if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    ANALYZE public.user_profiles;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usage') THEN
    ANALYZE public.usage;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cached_responses') THEN
    ANALYZE public.cached_responses;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'claude_conversations') THEN
    ANALYZE public.claude_conversations;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_provider_credentials') THEN
    ANALYZE public.user_provider_credentials;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cli_auth_sessions') THEN
    ANALYZE public.cli_auth_sessions;
  END IF;
END $$;

-- 8. Create a function to clean up old sessions and expired cache
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Delete CLI auth sessions older than 7 days (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'cli_auth_sessions') THEN
    DELETE FROM public.cli_auth_sessions
    WHERE created_at < NOW() - INTERVAL '7 days';
  END IF;

  -- Delete expired cached responses
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'cached_responses') THEN
    DELETE FROM public.cached_responses
    WHERE expires_at < NOW();
  END IF;

  -- Clean up old usage records older than 90 days (optional, for performance)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'usage') THEN
    DELETE FROM public.usage
    WHERE created_at < NOW() - INTERVAL '90 days';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create a scheduled job to run cleanup (if pg_cron is available)
-- Note: This requires pg_cron extension
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule cleanup to run daily at 2 AM
    PERFORM cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data();');
  END IF;
EXCEPTION
  WHEN others THEN
    -- pg_cron not available, ignore
    NULL;
END $$;

-- Output success message
SELECT 'Database performance optimization completed' as status;