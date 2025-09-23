-- =====================================================
-- FIX CLI AUTHENTICATION RLS POLICIES
-- Allow anonymous read access for recent sessions to enable CLI polling
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their own CLI auth sessions" ON public.cli_auth_sessions;

-- Create new policies with different permissions
-- 1. Allow authenticated users to create/update their own sessions
CREATE POLICY "Authenticated users can create their own CLI auth sessions"
  ON public.cli_auth_sessions
  FOR INSERT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update their own CLI auth sessions"
  ON public.cli_auth_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Allow ANONYMOUS read access to RECENT sessions (last 10 minutes)
-- This enables the CLI to poll for authentication without being authenticated
CREATE POLICY "Anyone can read recent CLI auth sessions"
  ON public.cli_auth_sessions
  FOR SELECT
  USING (
    created_at > (NOW() - INTERVAL '10 minutes')
    AND status = 'authenticated'
  );

-- 3. Allow authenticated users to read all their own sessions
CREATE POLICY "Authenticated users can read their own CLI auth sessions"
  ON public.cli_auth_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Similarly for user_provider_credentials
DROP POLICY IF EXISTS "Users can manage their own provider credentials" ON public.user_provider_credentials;

-- Allow authenticated users full control
CREATE POLICY "Authenticated users can manage their own provider credentials"
  ON public.user_provider_credentials
  FOR ALL
  USING (auth.uid() = user_id);

-- Allow anonymous read of recent credentials for CLI polling
CREATE POLICY "Anyone can read recent provider credentials"
  ON public.user_provider_credentials
  FOR SELECT
  USING (
    updated_at > (NOW() - INTERVAL '10 minutes')
    AND status = 'ready'
  );

-- Grant necessary permissions
GRANT SELECT ON public.cli_auth_sessions TO anon;
GRANT SELECT ON public.user_provider_credentials TO anon;

-- Output success message
SELECT 'CLI authentication RLS policies fixed' as status;