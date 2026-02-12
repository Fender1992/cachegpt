-- Discord Integration Schema
-- Extends the existing user_integrations and integration_documents tables
-- to support Discord servers, channels, and messages

-- First, update the integration provider enum to include discord
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'discord';

-- Create Discord-specific metadata table for guilds (servers) and channels
CREATE TABLE IF NOT EXISTS discord_guild_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL, -- Discord server ID
  guild_name TEXT NOT NULL,
  icon_url TEXT,
  owner_id TEXT,
  member_count INTEGER,
  premium_tier INTEGER,
  description TEXT,
  features JSONB, -- Discord server features array
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration_id, guild_id)
);

CREATE TABLE IF NOT EXISTS discord_channel_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL, -- Discord channel ID
  channel_name TEXT NOT NULL,
  channel_type INTEGER NOT NULL, -- 0: text, 2: voice, 4: category, 5: news, etc.
  parent_id TEXT, -- Parent category ID
  topic TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  last_message_id TEXT,
  last_sync_message_id TEXT, -- Track where we left off syncing
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration_id, channel_id)
);

-- Indexes for Discord metadata
CREATE INDEX IF NOT EXISTS idx_discord_guild_integration ON discord_guild_metadata(integration_id);
CREATE INDEX IF NOT EXISTS idx_discord_channel_integration ON discord_channel_metadata(integration_id);
CREATE INDEX IF NOT EXISTS idx_discord_channel_guild ON discord_channel_metadata(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_channel_updated ON discord_channel_metadata(updated_at);

-- Function to get Discord context with channel and user info
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
    JSONB_BUILD_OBJECT(
      'guild_name', gm.guild_name,
      'channel_name', cm.channel_name,
      'channel_type', cm.channel_type
    ) AS metadata,
    (d.embedding <=> p_query_embedding)::FLOAT AS similarity
  FROM integration_documents d
  JOIN user_integrations ui ON d.integration_id = ui.id
  LEFT JOIN discord_channel_metadata cm ON cm.integration_id = ui.id 
    AND d.metadata->>'channel_id' = cm.channel_id
  LEFT JOIN discord_guild_metadata gm ON gm.integration_id = ui.id
    AND cm.guild_id = gm.guild_id
  WHERE ui.user_id = p_user_id
    AND ui.provider = 'discord'
    AND ui.status = 'active'
    AND (
      d.content ILIKE '%' || p_query_text || '%'
      OR d.title ILIKE '%' || p_query_text || '%'
      OR (d.embedding <=> p_query_embedding) < 0.3
    )
    AND (p_guild_id IS NULL OR cm.guild_id = p_guild_id)
    AND (p_channel_id IS NULL OR cm.channel_id = p_channel_id)
  ORDER BY 
    CASE 
      WHEN d.content ILIKE '%' || p_query_text || '%' THEN 1
      WHEN d.title ILIKE '%' || p_query_text || '%' THEN 2
      ELSE 3
    END,
    (d.embedding <=> p_query_embedding)
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_discord_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_discord_guild_timestamp
  BEFORE UPDATE ON discord_guild_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_discord_metadata_timestamp();

CREATE TRIGGER update_discord_channel_timestamp
  BEFORE UPDATE ON discord_channel_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_discord_metadata_timestamp();

-- Grant permissions
GRANT ALL ON discord_guild_metadata TO postgres, anon, authenticated, service_role;
GRANT ALL ON discord_channel_metadata TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_discord_context TO postgres, anon, authenticated, service_role;