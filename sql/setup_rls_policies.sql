-- Enable Row Level Security (RLS) and set up policies
-- Run this script in Supabase SQL Editor after setup_database.sql

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for clean setup)
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can manage own API keys" ON api_keys;
DROP POLICY IF EXISTS "Users can view own cache entries" ON cache_entries;
DROP POLICY IF EXISTS "Users can insert own cache entries" ON cache_entries;
DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;

-- User Profiles policies
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- API Keys policies
CREATE POLICY "Users can manage own API keys" ON api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Cache Entries policies
CREATE POLICY "Users can view own cache entries" ON cache_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cache entries" ON cache_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Usage Logs policies
CREATE POLICY "Users can view own usage logs" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Grant necessary permissions to authenticated users
GRANT ALL ON user_profiles TO authenticated;
GRANT ALL ON api_keys TO authenticated;
GRANT ALL ON cache_entries TO authenticated;
GRANT ALL ON usage_logs TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Important: Also allow service role full access (for backend operations)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;