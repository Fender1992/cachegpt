-- Authentication Tables
-- Run this script to add authentication tables to the database

-- Add password_hash column to user_profiles if not exists
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP DEFAULT NOW(),
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT
);

-- User Sessions Table (for tracking active sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT
);

-- Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP NULL,
  ip_address INET
);

-- Login Attempts Table (for security monitoring)
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address INET NOT NULL,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  attempted_at TIMESTAMP DEFAULT NOW()
);

-- Security Events Table (for audit logging)
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens (is_active);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions (is_active);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts (ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts (attempted_at);

CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events (user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events (event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events (created_at);

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deactivate expired refresh tokens
  UPDATE refresh_tokens
  SET is_active = FALSE, updated_at = NOW()
  WHERE expires_at < NOW() AND is_active = TRUE;

  -- Deactivate expired sessions
  UPDATE user_sessions
  SET is_active = FALSE, last_activity = NOW()
  WHERE expires_at < NOW() AND is_active = TRUE;

  -- Mark expired password reset tokens as used
  UPDATE password_reset_tokens
  SET is_used = TRUE
  WHERE expires_at < NOW() AND is_used = FALSE;

  -- Log cleanup event
  INSERT INTO security_events (event_type, event_data)
  VALUES ('token_cleanup', json_build_object(
    'cleaned_at', NOW(),
    'type', 'automated_cleanup'
  ));
END;
$$;

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
  user_id_param UUID,
  event_type_param TEXT,
  event_data_param JSONB DEFAULT '{}'::jsonb,
  ip_address_param INET DEFAULT NULL,
  user_agent_param TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO security_events (
    user_id, event_type, event_data, ip_address, user_agent
  ) VALUES (
    user_id_param, event_type_param, event_data_param, ip_address_param, user_agent_param
  );
END;
$$;

-- Function to get user's active sessions count
CREATE OR REPLACE FUNCTION get_user_active_sessions_count(user_id_param UUID)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  session_count integer;
BEGIN
  SELECT COUNT(*)
  INTO session_count
  FROM refresh_tokens
  WHERE user_id = user_id_param
    AND is_active = TRUE
    AND expires_at > NOW();

  RETURN session_count;
END;
$$;

-- Function to revoke all user sessions except current
CREATE OR REPLACE FUNCTION revoke_other_sessions(
  user_id_param UUID,
  current_token_hash TEXT
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  revoked_count integer;
BEGIN
  UPDATE refresh_tokens
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = user_id_param
    AND token_hash != current_token_hash
    AND is_active = TRUE;

  GET DIAGNOSTICS revoked_count = ROW_COUNT;

  -- Log the event
  PERFORM log_security_event(
    user_id_param,
    'sessions_revoked',
    json_build_object('revoked_count', revoked_count, 'reason', 'user_initiated')
  );

  RETURN revoked_count;
END;
$$;

-- Trigger to update last_used timestamp on refresh token usage
CREATE OR REPLACE FUNCTION update_refresh_token_last_used()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- This would be called when a refresh token is used
  -- In practice, this might be triggered by application logic
  NEW.last_used = NOW();
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Row Level Security (RLS) Policies

-- Enable RLS on auth tables
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Refresh tokens policy
CREATE POLICY "Users can only access their own refresh tokens" ON refresh_tokens
  FOR ALL USING (auth.uid() = user_id);

-- User sessions policy
CREATE POLICY "Users can only access their own sessions" ON user_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Password reset tokens policy
CREATE POLICY "Users can only access their own password reset tokens" ON password_reset_tokens
  FOR ALL USING (auth.uid() = user_id);

-- Security events policy
CREATE POLICY "Users can only access their own security events" ON security_events
  FOR SELECT USING (auth.uid() = user_id);

-- Allow service role to manage all auth tables
CREATE POLICY "Service role can manage refresh tokens" ON refresh_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage user sessions" ON user_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage password reset tokens" ON password_reset_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage security events" ON security_events
  FOR ALL USING (auth.role() = 'service_role');

-- Initial cleanup of any existing expired tokens
SELECT cleanup_expired_auth_tokens();