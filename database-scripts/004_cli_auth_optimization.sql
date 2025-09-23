-- =====================================================
-- CLI AUTHENTICATION TABLES - CREATE FROM SCRATCH
-- Works with your actual existing database tables only
-- =====================================================

-- 1. CREATE cli_auth_sessions table for browser-to-CLI OAuth communication
CREATE TABLE IF NOT EXISTS public.cli_auth_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  user_email TEXT NOT NULL,
  expires_at BIGINT,
  status TEXT DEFAULT 'authenticated' CHECK (status IN ('authenticated', 'consumed', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Add unique constraint on user_id for upsert operations
  UNIQUE(user_id)
);

-- 2. CREATE user_provider_credentials table for LLM provider tokens
CREATE TABLE IF NOT EXISTS public.user_provider_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'chatgpt', 'gemini', 'perplexity')),
  user_email TEXT NOT NULL,
  key_name TEXT, -- Optional key name, nullable for backwards compatibility
  llm_token TEXT, -- Base64 encoded LLM session token
  session_token TEXT, -- Base64 encoded OAuth session token
  api_key TEXT, -- Base64 encoded API key (alternative to token)
  auto_captured BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'ready' CHECK (status IN ('ready', 'expired', 'invalid')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per user per provider
  UNIQUE(user_id, provider)
);

-- 3. DROP unused tables that actually exist in your database
DROP TABLE IF EXISTS public.popular_queries CASCADE;
-- Note: Not dropping profiles, claude_conversations, claude_messages as they might be referenced

-- 4. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cli_auth_sessions_status_created ON public.cli_auth_sessions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cli_auth_sessions_user_id ON public.cli_auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_provider_creds_user_provider ON public.user_provider_credentials(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_provider_creds_status ON public.user_provider_credentials(status, updated_at DESC);

-- 5. Enable RLS
ALTER TABLE public.cli_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_provider_credentials ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
CREATE POLICY "Users can manage their own CLI auth sessions" ON public.cli_auth_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own provider credentials" ON public.user_provider_credentials
  FOR ALL USING (auth.uid() = user_id);

-- 7. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cli_auth_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_provider_credentials TO authenticated;

-- 8. Add updated_at triggers (only if handle_updated_at function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
    EXECUTE 'CREATE TRIGGER handle_cli_auth_sessions_updated_at
      BEFORE UPDATE ON public.cli_auth_sessions
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()';

    EXECUTE 'CREATE TRIGGER handle_user_provider_credentials_updated_at
      BEFORE UPDATE ON public.user_provider_credentials
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()';
  END IF;
END $$;