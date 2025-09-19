-- =====================================================
-- CONSOLIDATED SETUP SCRIPT FOR CACHEGPT
-- Only includes tables actually used in the codebase
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. CACHED_RESPONSES TABLE (Main cache table)
-- =====================================================

CREATE TABLE IF NOT EXISTS cached_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Query fields
  query TEXT NOT NULL,
  query_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(query::bytea), 'hex')) STORED,

  -- Response fields
  response TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,

  -- Vector embedding for similarity search
  embedding vector(384), -- 384 dimensions for all-MiniLM-L6-v2

  -- User tracking
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',

  -- Usage tracking
  access_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_query_hash_model_user ON cached_responses(query_hash, model, user_id);
CREATE INDEX IF NOT EXISTS idx_embedding_cosine ON cached_responses USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_user_model_created ON cached_responses(user_id, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expires_at ON cached_responses(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- 2. USER_PROFILES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- OAuth provider information
  provider TEXT DEFAULT 'email',
  provider_id TEXT,

  -- User plan and limits
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
  api_calls_limit INTEGER DEFAULT 1000,
  api_calls_used INTEGER DEFAULT 0,

  -- Account status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_provider ON user_profiles(provider, provider_id);

-- =====================================================
-- 3. USAGE TABLE (Tracks API usage - used by multiple components)
-- =====================================================

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

-- =====================================================
-- 4. OAUTH_PROVIDERS TABLE
-- =====================================================

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

-- =====================================================
-- 5. API_KEYS TABLE (For API access)
-- =====================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL, -- First 8 chars for identification
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- =====================================================
-- 6. POPULAR_QUERIES TABLE (For cache pre-warming)
-- =====================================================

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
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE cached_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE popular_queries ENABLE ROW LEVEL SECURITY;

-- Cached responses policies
CREATE POLICY "Users can view own cached responses"
  ON cached_responses FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own cached responses"
  ON cached_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- User profiles policies
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Usage policies
CREATE POLICY "Users can view own usage"
  ON usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- OAuth providers policies
CREATE POLICY "Users can manage own OAuth providers"
  ON oauth_providers FOR ALL
  USING (auth.uid() = user_id);

-- API keys policies
CREATE POLICY "Users can manage own API keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);

-- Popular queries - public read, authenticated write
CREATE POLICY "Anyone can read popular queries"
  ON popular_queries FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update popular queries"
  ON popular_queries FOR ALL
  USING (auth.role() = 'authenticated');

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, provider, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function for similarity search
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

-- Function to get user stats
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
-- GRANT PERMISSIONS
-- =====================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- =====================================================
-- FINAL CHECK
-- =====================================================

-- List all created tables
SELECT 'Setup complete. Tables created:' as status;
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'cached_responses',
  'user_profiles',
  'usage',
  'oauth_providers',
  'api_keys',
  'popular_queries'
)
ORDER BY tablename;