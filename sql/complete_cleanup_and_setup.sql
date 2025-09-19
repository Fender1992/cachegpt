-- =====================================================
-- COMPLETE CLEANUP AND SETUP
-- Remove unused tables and create only what's needed
-- =====================================================

-- =====================================================
-- STEP 1: DROP UNUSED TABLES
-- =====================================================

-- Tables that exist but are NOT used in codebase:
DROP TABLE IF EXISTS cache_entries CASCADE;
DROP TABLE IF EXISTS cached_responses_archive CASCADE;
DROP TABLE IF EXISTS monthly_usage CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS user_features CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;

-- Drop old partition tables (keep only current month + next 2 months)
DROP TABLE IF EXISTS cached_responses_2025_01 CASCADE;
DROP TABLE IF EXISTS cached_responses_2025_02 CASCADE;
DROP TABLE IF EXISTS cached_responses_2025_03 CASCADE;

-- Keep current partitions for September/October/November 2025

-- =====================================================
-- STEP 2: CREATE MISSING REQUIRED TABLES
-- =====================================================

-- Create USAGE table (missing but required by codebase)
CREATE TABLE IF NOT EXISTS usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request details
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  model TEXT,

  -- Performance metrics
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT false,

  -- Cost tracking
  cost DECIMAL(10,6) DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_cache_hits ON usage(user_id, cache_hit) WHERE cache_hit = true;

-- Create OAUTH_PROVIDERS table (missing but required)
CREATE TABLE IF NOT EXISTS oauth_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  provider_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_providers_lookup ON oauth_providers(provider, provider_user_id);

-- Create POPULAR_QUERIES table (missing but required)
CREATE TABLE IF NOT EXISTS popular_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,
  request_count INTEGER DEFAULT 1,
  last_requested TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_cached BOOLEAN DEFAULT FALSE,
  UNIQUE(query_hash)
);

CREATE INDEX IF NOT EXISTS idx_popular_queries_count ON popular_queries(request_count DESC);

-- =====================================================
-- STEP 3: UPDATE EXISTING TABLES
-- =====================================================

-- Ensure user_profiles has all required columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'email';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS api_calls_limit INTEGER DEFAULT 1000;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS api_calls_used INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add constraint for plan_type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'user_profiles_plan_type_check'
    ) THEN
        ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_plan_type_check
        CHECK (plan_type IN ('free', 'pro', 'enterprise'));
    END IF;
END $$;

-- Ensure cached_responses has all required columns
ALTER TABLE cached_responses ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 1;
ALTER TABLE cached_responses ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE cached_responses ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
ALTER TABLE cached_responses ADD COLUMN IF NOT EXISTS cost_saved DECIMAL(10,6) DEFAULT 0;
ALTER TABLE cached_responses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE cached_responses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days';

-- =====================================================
-- STEP 4: ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE cached_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE popular_queries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own cached responses" ON cached_responses;
DROP POLICY IF EXISTS "Users can insert own cached responses" ON cached_responses;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own usage" ON usage;
DROP POLICY IF EXISTS "Users can insert own usage" ON usage;
DROP POLICY IF EXISTS "Users can manage own OAuth providers" ON oauth_providers;
DROP POLICY IF EXISTS "Users can manage own API keys" ON api_keys;
DROP POLICY IF EXISTS "Anyone can read popular queries" ON popular_queries;
DROP POLICY IF EXISTS "Authenticated users can update popular queries" ON popular_queries;

-- Create policies
CREATE POLICY "Users can view own cached responses"
  ON cached_responses FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own cached responses"
  ON cached_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view own usage"
  ON usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own OAuth providers"
  ON oauth_providers FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own API keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read popular queries"
  ON popular_queries FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update popular queries"
  ON popular_queries FOR ALL
  USING (auth.role() = 'authenticated');

-- =====================================================
-- STEP 5: CREATE REQUIRED FUNCTIONS
-- =====================================================

-- Simple user profile creation function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (
    id,
    email,
    provider,
    email_verified
  )
  VALUES (
    NEW.id,
    NEW.email,
    'email',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Similarity search functions
CREATE OR REPLACE FUNCTION match_cache_entries(
  query_embedding vector,
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 5,
  model_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  query text,
  response text,
  model varchar,
  created_at timestamp with time zone,
  similarity float,
  access_count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.query,
    cr.response,
    cr.model,
    cr.created_at,
    1 - (cr.embedding <=> query_embedding) AS similarity,
    cr.access_count
  FROM cached_responses cr
  WHERE (model_filter IS NULL OR cr.model = model_filter)
    AND 1 - (cr.embedding <=> query_embedding) > match_threshold
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Alias for compatibility
CREATE OR REPLACE FUNCTION match_responses(
  query_embedding vector,
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 5,
  model_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  query text,
  response text,
  model varchar,
  created_at timestamp with time zone,
  similarity float,
  access_count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM match_cache_entries(
    query_embedding,
    match_threshold,
    match_count,
    model_filter
  );
END;
$$ LANGUAGE plpgsql;

-- User stats function
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE (
  total_requests INTEGER,
  cache_hits INTEGER,
  cache_hit_rate DECIMAL,
  total_cost DECIMAL,
  total_saved DECIMAL,
  tokens_used INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_requests,
    COUNT(CASE WHEN cache_hit THEN 1 END)::INTEGER as cache_hits,
    ROUND(COUNT(CASE WHEN cache_hit THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as cache_hit_rate,
    SUM(cost)::DECIMAL as total_cost,
    SUM(cost_saved)::DECIMAL as total_saved,
    SUM(tokens_used)::INTEGER as tokens_used
  FROM usage
  WHERE user_id = p_user_id
  AND created_at > NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 6: FINAL CHECK
-- =====================================================

-- List final tables
SELECT 'Cleanup and setup complete. Active tables:' as status;
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;