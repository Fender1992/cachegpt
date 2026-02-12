-- =====================================================
-- DISCORD INTEGRATION EXTENSION
-- Adds Discord-specific tables and functions
-- Works with existing user_integrations schema
-- =====================================================

-- Ensure vector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Discord Guild (Server) Metadata Table
CREATE TABLE IF NOT EXISTS public.discord_guild_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  guild_name TEXT NOT NULL,
  icon_url TEXT,
  owner_id TEXT,
  member_count INTEGER,
  premium_tier INTEGER,
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(integration_id, guild_id)
);

-- 2. Discord Channel Metadata Table
CREATE TABLE IF NOT EXISTS public.discord_channel_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_type INTEGER NOT NULL,
  parent_id TEXT,
  topic TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  last_message_id TEXT,
  last_sync_message_id TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(integration_id, channel_id)
);

-- 3. Indexes for Discord metadata
CREATE INDEX IF NOT EXISTS idx_discord_guild_integration 
  ON public.discord_guild_metadata(integration_id);

CREATE INDEX IF NOT EXISTS idx_discord_channel_integration 
  ON public.discord_channel_metadata(integration_id);

CREATE INDEX IF NOT EXISTS idx_discord_channel_guild 
  ON public.discord_channel_metadata(guild_id);

CREATE INDEX IF NOT EXISTS idx_discord_channel_updated 
  ON public.discord_channel_metadata(updated_at);

-- 4. Search function for Discord context
CREATE OR REPLACE FUNCTION search_discord_context(
  p_user_id UUID,
  p_query_text TEXT,
  p_query_embedding vector(1536),
  p_guild_id TEXT DEFAULT NULL,
  p_channel_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  source_id TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.source_id,
    d.title,
    d.content,
    d.metadata || 
    COALESCE(
      JSONB_BUILD_OBJECT(
        'guild_name', gm.guild_name,
        'channel_name', cm.channel_name,
        'channel_type', cm.channel_type
      ),
      '{}'::jsonb
    ) AS metadata,
    1 - (d.embedding <=> p_query_embedding) AS similarity
  FROM public.integration_documents d
  JOIN public.user_integrations ui ON d.integration_id = ui.id
  LEFT JOIN public.discord_channel_metadata cm ON cm.integration_id = ui.id 
    AND d.metadata->>'channel_id' = cm.channel_id
  LEFT JOIN public.discord_guild_metadata gm ON gm.integration_id = ui.id
    AND cm.guild_id = gm.guild_id
  WHERE ui.user_id = p_user_id
    AND ui.provider = 'discord'
    AND ui.status = 'active'
    AND (
      d.content ILIKE '%' || p_query_text || '%'
      OR d.title ILIKE '%' || p_query_text || '%'
      OR (1 - (d.embedding <=> p_query_embedding)) >= 0.7
    )
    AND (p_guild_id IS NULL OR cm.guild_id = p_guild_id)
    AND (p_channel_id IS NULL OR cm.channel_id = p_channel_id)
  ORDER BY 
    CASE 
      WHEN d.content ILIKE '%' || p_query_text || '%' THEN 1
      WHEN d.title ILIKE '%' || p_query_text || '%' THEN 2
      ELSE 3
    END,
    d.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update timestamp triggers
CREATE OR REPLACE FUNCTION update_discord_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_discord_guild_timestamp
  BEFORE UPDATE ON public.discord_guild_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_discord_metadata_timestamp();

CREATE TRIGGER update_discord_channel_timestamp
  BEFORE UPDATE ON public.discord_channel_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_discord_metadata_timestamp();

-- 6. Row Level Security for Discord tables
ALTER TABLE public.discord_guild_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_channel_metadata ENABLE ROW LEVEL SECURITY;

-- Policies for discord_guild_metadata
CREATE POLICY "Users can view their own Discord guilds"
  ON public.discord_guild_metadata FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM public.user_integrations 
      WHERE user_id = auth.uid() AND provider = 'discord'
    )
  );

CREATE POLICY "Service role full access to Discord guilds"
  ON public.discord_guild_metadata FOR ALL
  USING (auth.role() = 'service_role');

-- Policies for discord_channel_metadata
CREATE POLICY "Users can view their own Discord channels"
  ON public.discord_channel_metadata FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM public.user_integrations 
      WHERE user_id = auth.uid() AND provider = 'discord'
    )
  );

CREATE POLICY "Service role full access to Discord channels"
  ON public.discord_channel_metadata FOR ALL
  USING (auth.role() = 'service_role');

-- 7. Grant permissions
GRANT ALL ON public.discord_guild_metadata TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.discord_channel_metadata TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_discord_context TO postgres, anon, authenticated, service_role;

-- 8. Comments
COMMENT ON TABLE public.discord_guild_metadata IS 
  'Discord server (guild) information for connected integrations';

COMMENT ON TABLE public.discord_channel_metadata IS 
  'Discord channel information and sync status';

COMMENT ON FUNCTION search_discord_context IS 
  'Hybrid search for Discord messages using text and semantic similarity';

-- 9. Analyze tables for query optimization
ANALYZE public.discord_guild_metadata;
ANALYZE public.discord_channel_metadata;

-- 10. Verify installation
DO $$
BEGIN
  RAISE NOTICE 'Discord integration tables created successfully';
  RAISE NOTICE 'Tables created: discord_guild_metadata, discord_channel_metadata';
  RAISE NOTICE 'Function created: search_discord_context()';
  RAISE NOTICE 'Migration complete!';
END $$;