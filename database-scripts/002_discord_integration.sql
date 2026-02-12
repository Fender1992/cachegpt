-- =====================================================
-- DISCORD INTEGRATION TABLES
-- For storing Discord OAuth credentials and settings
-- =====================================================

-- Discord user credentials table
CREATE TABLE IF NOT EXISTS user_discord_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Discord OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Discord user info
  discord_user_id TEXT NOT NULL,
  discord_username TEXT,
  discord_discriminator TEXT,
  discord_avatar TEXT,
  discord_global_name TEXT,
  
  -- Guild access (comma-separated list of guild IDs user has access to)
  allowed_guilds TEXT[],
  
  -- Settings
  notifications_enabled BOOLEAN DEFAULT true,
  auto_connect BOOLEAN DEFAULT false,
  
  -- Metadata
  scopes TEXT[] DEFAULT ARRAY['identify', 'guilds', 'messages.read', 'messages.write'],
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id),
  UNIQUE(discord_user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discord_credentials_user ON user_discord_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_credentials_discord_user ON user_discord_credentials(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_discord_credentials_expires ON user_discord_credentials(expires_at) WHERE expires_at IS NOT NULL;

-- Row Level Security
ALTER TABLE user_discord_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own Discord credentials
CREATE POLICY "Users can manage own Discord credentials"
  ON user_discord_credentials FOR ALL
  USING (auth.uid() = user_id);

-- Function to update user's Discord credentials
CREATE OR REPLACE FUNCTION upsert_discord_credentials(
  p_user_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_at TIMESTAMP WITH TIME ZONE,
  p_discord_user_id TEXT,
  p_discord_username TEXT DEFAULT NULL,
  p_discord_discriminator TEXT DEFAULT NULL,
  p_discord_avatar TEXT DEFAULT NULL,
  p_discord_global_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  credential_id UUID;
BEGIN
  INSERT INTO user_discord_credentials (
    user_id,
    access_token,
    refresh_token,
    expires_at,
    discord_user_id,
    discord_username,
    discord_discriminator,
    discord_avatar,
    discord_global_name,
    updated_at
  )
  VALUES (
    p_user_id,
    p_access_token,
    p_refresh_token,
    p_expires_at,
    p_discord_user_id,
    p_discord_username,
    p_discord_discriminator,
    p_discord_avatar,
    p_discord_global_name,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    expires_at = EXCLUDED.expires_at,
    discord_user_id = EXCLUDED.discord_user_id,
    discord_username = EXCLUDED.discord_username,
    discord_discriminator = EXCLUDED.discord_discriminator,
    discord_avatar = EXCLUDED.discord_avatar,
    discord_global_name = EXCLUDED.discord_global_name,
    updated_at = NOW()
  RETURNING id INTO credential_id;
  
  RETURN credential_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh Discord token
CREATE OR REPLACE FUNCTION refresh_discord_token(
  p_user_id UUID,
  p_new_access_token TEXT,
  p_new_refresh_token TEXT DEFAULT NULL,
  p_new_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE user_discord_credentials
  SET
    access_token = p_new_access_token,
    refresh_token = COALESCE(p_new_refresh_token, refresh_token),
    expires_at = COALESCE(p_new_expires_at, expires_at),
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON user_discord_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_discord_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_discord_token TO authenticated;

-- Final status
SELECT 'Discord integration tables created successfully' as status;