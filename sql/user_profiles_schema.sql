-- =====================================================
-- USER PROFILES AND AUTHENTICATION SCHEMA
-- For CacheGPT user management and OAuth support
-- =====================================================

-- Create user_profiles table to extend Supabase auth.users
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- OAuth provider information
  provider TEXT DEFAULT 'email', -- 'email', 'google', 'github'
  provider_id TEXT, -- External provider user ID

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

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for performance
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_provider ON user_profiles(provider, provider_id);
CREATE INDEX idx_user_profiles_plan ON user_profiles(plan_type);
CREATE INDEX idx_user_profiles_active ON user_profiles(is_active) WHERE is_active = true;

-- =====================================================
-- USER USAGE TRACKING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Request details
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
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

  -- Request metadata
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for usage analytics
CREATE INDEX idx_user_usage_user_date ON user_usage(user_id, created_at DESC);
CREATE INDEX idx_user_usage_cache_hits ON user_usage(user_id, cache_hit) WHERE cache_hit = true;
CREATE INDEX idx_user_usage_endpoint ON user_usage(endpoint, created_at DESC);

-- =====================================================
-- OAUTH PROVIDERS TABLE
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

  -- Ensure one provider account per user
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_oauth_providers_lookup ON oauth_providers(provider, provider_user_id);

-- =====================================================
-- USER SESSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_user_sessions_token ON user_sessions(session_token) WHERE is_active = true;
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id, is_active);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at) WHERE is_active = true;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- User usage policies
CREATE POLICY "Users can view own usage"
  ON user_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert usage"
  ON user_usage FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() = user_id);

-- OAuth providers policies
CREATE POLICY "Users can view own OAuth providers"
  ON oauth_providers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own OAuth providers"
  ON oauth_providers FOR ALL
  USING (auth.uid() = user_id);

-- User sessions policies
CREATE POLICY "Users can view own sessions"
  ON user_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON user_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_providers_updated_at
  BEFORE UPDATE ON oauth_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  UPDATE user_sessions
  SET is_active = false
  WHERE expires_at < NOW() AND is_active = true;

  DELETE FROM user_sessions
  WHERE expires_at < NOW() - INTERVAL '30 days';
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
  FROM user_usage
  WHERE user_id = p_user_id
  AND created_at > NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL DATA AND CONFIGURATION
-- =====================================================

-- Insert default OAuth provider configurations (for reference)
INSERT INTO oauth_providers (user_id, provider, provider_data)
VALUES
  (NULL, 'google', '{"client_id": "YOUR_GOOGLE_CLIENT_ID", "scope": "email profile"}'),
  (NULL, 'github', '{"client_id": "YOUR_GITHUB_CLIENT_ID", "scope": "user:email"}')
ON CONFLICT DO NOTHING;

-- =====================================================
-- VIEWS FOR EASY ACCESS
-- =====================================================

-- User dashboard view
CREATE OR REPLACE VIEW user_dashboard AS
SELECT
  up.id,
  up.email,
  up.full_name,
  up.plan_type,
  up.api_calls_limit,
  up.api_calls_used,
  up.created_at,
  COALESCE(stats.total_requests, 0) as total_requests_30d,
  COALESCE(stats.cache_hits, 0) as cache_hits_30d,
  COALESCE(stats.cache_hit_rate, 0) as cache_hit_rate,
  COALESCE(stats.total_saved, 0) as total_saved_30d
FROM user_profiles up
LEFT JOIN LATERAL (
  SELECT * FROM get_user_stats(up.id)
) stats ON true
WHERE up.is_active = true;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;