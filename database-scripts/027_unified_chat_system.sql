-- =====================================================
-- UNIFIED CHAT HISTORY SYSTEM WITH MODEL SWITCHING
-- Creates comprehensive chat history and model management
-- =====================================================

-- 1. CONVERSATIONS TABLE (Groups related messages)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'groq', 'huggingface', 'openrouter')),
  model TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  platform TEXT DEFAULT 'web' CHECK (platform IN ('web', 'mobile', 'cli')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- 2. MESSAGES TABLE (Individual messages within conversations)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'groq', 'huggingface', 'openrouter')),
  model TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  cost DECIMAL(10,6) DEFAULT 0,
  platform TEXT DEFAULT 'web' CHECK (platform IN ('web', 'mobile', 'cli')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- 3. USER_MODEL_PREFERENCES TABLE (Persistent model selections per provider)
CREATE TABLE IF NOT EXISTS public.user_model_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'groq', 'huggingface', 'openrouter')),
  preferred_model TEXT NOT NULL,
  is_premium BOOLEAN DEFAULT FALSE,
  platform TEXT DEFAULT 'web' CHECK (platform IN ('web', 'mobile', 'cli')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one preference per user per provider per platform
  UNIQUE(user_id, provider, platform)
);

-- 4. PROVIDER_MODELS TABLE (Available models for each provider)
CREATE TABLE IF NOT EXISTS public.provider_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'groq', 'huggingface', 'openrouter')),
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  is_free BOOLEAN DEFAULT TRUE,
  requires_api_key BOOLEAN DEFAULT FALSE,
  max_tokens INTEGER DEFAULT 4096,
  cost_per_million_input DECIMAL(10,4) DEFAULT 0,
  cost_per_million_output DECIMAL(10,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique model per provider
  UNIQUE(provider, model_id)
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_provider_model ON public.conversations(provider, model);
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON public.conversations(user_id, platform);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON public.messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_provider_model ON public.messages(provider, model);

CREATE INDEX IF NOT EXISTS idx_user_model_prefs_user_provider ON public.user_model_preferences(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_model_prefs_platform ON public.user_model_preferences(user_id, platform);

CREATE INDEX IF NOT EXISTS idx_provider_models_active ON public.provider_models(provider, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_provider_models_free ON public.provider_models(provider, is_free) WHERE is_free = true;

-- 6. Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_model_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_models ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- Conversations policies
CREATE POLICY "Users can manage their own conversations"
  ON public.conversations FOR ALL
  USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can manage their own messages"
  ON public.messages FOR ALL
  USING (auth.uid() = user_id);

-- User model preferences policies
CREATE POLICY "Users can manage their own model preferences"
  ON public.user_model_preferences FOR ALL
  USING (auth.uid() = user_id);

-- Provider models policies (read-only for users)
CREATE POLICY "Everyone can read provider models"
  ON public.provider_models FOR SELECT
  USING (is_active = true);

-- 8. Trigger functions for automatic updates
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update conversation timestamp when messages are added
CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- 9. Function to get user chat history with pagination
CREATE OR REPLACE FUNCTION get_user_conversations(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_platform TEXT DEFAULT NULL
)
RETURNS TABLE (
  conversation_id UUID,
  title TEXT,
  provider TEXT,
  model TEXT,
  message_count BIGINT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  is_pinned BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    COALESCE(c.title, LEFT(first_msg.content, 50) || '...') as title,
    c.provider,
    c.model,
    msg_count.count as message_count,
    c.updated_at as last_message_at,
    c.is_pinned,
    c.created_at
  FROM public.conversations c
  LEFT JOIN LATERAL (
    SELECT content
    FROM public.messages m
    WHERE m.conversation_id = c.id
    AND m.role = 'user'
    ORDER BY m.created_at ASC
    LIMIT 1
  ) first_msg ON true
  LEFT JOIN (
    SELECT conversation_id, COUNT(*) as count
    FROM public.messages
    GROUP BY conversation_id
  ) msg_count ON msg_count.conversation_id = c.id
  WHERE c.user_id = p_user_id
  AND (p_platform IS NULL OR c.platform = p_platform)
  AND c.is_archived = false
  ORDER BY c.is_pinned DESC, c.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 10. Function to get conversation messages
CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  message_id UUID,
  role TEXT,
  content TEXT,
  provider TEXT,
  model TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    m.provider,
    m.model,
    m.tokens_used,
    m.created_at
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.conversation_id = p_conversation_id
  AND c.user_id = p_user_id
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 11. Insert default provider models
INSERT INTO public.provider_models (provider, model_id, model_name, is_free, requires_api_key, max_tokens, cost_per_million_input, cost_per_million_output) VALUES
-- Free models
('groq', 'llama-3.3-70b-versatile', 'Llama 3.3 70B', true, false, 32000, 0, 0),
('openrouter', 'meta-llama/llama-4-scout:free', 'Llama 4 Scout', true, false, 128000, 0, 0),
('huggingface', 'Qwen/Qwen3-8B', 'Qwen3 8B', true, false, 32000, 0, 0),

-- ChatGPT models (require API key)
('chatgpt', 'gpt-4o', 'GPT-4o', false, true, 128000, 2.5, 10),
('chatgpt', 'gpt-4o-mini', 'GPT-4o Mini', false, true, 128000, 0.15, 0.6),
('chatgpt', 'gpt-4-turbo', 'GPT-4 Turbo', false, true, 128000, 10, 30),
('chatgpt', 'gpt-3.5-turbo', 'GPT-3.5 Turbo', false, true, 16000, 0.5, 1.5),

-- Claude models (require API key)
('claude', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', false, true, 200000, 3, 15),
('claude', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', false, true, 200000, 0.25, 1.25),
('claude', 'claude-3-opus-20240229', 'Claude 3 Opus', false, true, 200000, 15, 75),

-- Gemini models (require API key)
('gemini', 'gemini-1.5-pro', 'Gemini 1.5 Pro', false, true, 2000000, 1.25, 5),
('gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', false, true, 1000000, 0.075, 0.3),
('gemini', 'gemini-1.0-pro', 'Gemini 1.0 Pro', false, true, 32000, 0.5, 1.5)

ON CONFLICT (provider, model_id) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  is_free = EXCLUDED.is_free,
  requires_api_key = EXCLUDED.requires_api_key,
  max_tokens = EXCLUDED.max_tokens,
  cost_per_million_input = EXCLUDED.cost_per_million_input,
  cost_per_million_output = EXCLUDED.cost_per_million_output,
  is_active = EXCLUDED.is_active;

-- 12. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_model_preferences TO authenticated;
GRANT SELECT ON public.provider_models TO authenticated;
GRANT SELECT ON public.provider_models TO anon;

-- 13. Create updated_at triggers
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_user_model_preferences_updated_at
  BEFORE UPDATE ON public.user_model_preferences
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 'Unified chat system setup complete!' as status;
SELECT 'Created tables: conversations, messages, user_model_preferences, provider_models' as tables_created;