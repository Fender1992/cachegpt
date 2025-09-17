-- LLM Cache Proxy Database Setup
-- Run this script in Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  plan_type TEXT DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  key_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cache entries table
CREATE TABLE IF NOT EXISTS cache_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_embedding VECTOR(1536), -- OpenAI ada-002 dimensions
  response_text TEXT NOT NULL,
  model_used TEXT NOT NULL,
  tokens_saved INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
  hit_count INTEGER DEFAULT 0
);

-- Usage logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  api_key_id UUID REFERENCES api_keys(id),
  cache_hit BOOLEAN DEFAULT FALSE,
  tokens_used INTEGER DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  model_used TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cache_entries_query_hash ON cache_entries (query_hash);
CREATE INDEX IF NOT EXISTS idx_cache_entries_user_id ON cache_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries (expires_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id_created_at ON usage_logs (user_id, created_at);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_cache_entries (
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.85,
  match_count INT DEFAULT 1,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  response_text TEXT,
  similarity FLOAT,
  hit_count INTEGER,
  model_used TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cache_entries.id,
    cache_entries.query_text,
    cache_entries.response_text,
    1 - (cache_entries.query_embedding <=> query_embedding) AS similarity,
    cache_entries.hit_count,
    cache_entries.model_used
  FROM cache_entries
  WHERE 
    cache_entries.expires_at > NOW()
    AND (user_id_filter IS NULL OR cache_entries.user_id = user_id_filter)
    AND 1 - (cache_entries.query_embedding <=> query_embedding) > match_threshold
  ORDER BY cache_entries.query_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;