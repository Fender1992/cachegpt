-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the cached_responses table
CREATE TABLE IF NOT EXISTS cached_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  embedding vector(384), -- 384 dimensions for all-MiniLM-L6-v2
  model VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  access_count INTEGER DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',

  -- Indexes for performance
  INDEX idx_cached_responses_model (model),
  INDEX idx_cached_responses_created_at (created_at DESC),
  INDEX idx_cached_responses_user_id (user_id)
);

-- Create an index for vector similarity search
CREATE INDEX ON cached_responses USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create a function for similarity search
CREATE OR REPLACE FUNCTION match_responses(
  query_embedding vector,
  match_threshold float,
  match_count int,
  model_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  query text,
  response text,
  embedding vector,
  model varchar,
  created_at timestamp with time zone,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.query,
    cr.response,
    cr.embedding,
    cr.model,
    cr.created_at,
    1 - (cr.embedding <=> query_embedding) as similarity
  FROM cached_responses cr
  WHERE
    (model_filter IS NULL OR cr.model = model_filter)
    AND 1 - (cr.embedding <=> query_embedding) > match_threshold
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create a function to update access statistics
CREATE OR REPLACE FUNCTION update_access_stats(response_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cached_responses
  SET
    last_accessed = NOW(),
    access_count = access_count + 1
  WHERE id = response_id;
END;
$$;

-- Create a stats view
CREATE OR REPLACE VIEW cache_stats AS
SELECT
  COUNT(*) as total_responses,
  COUNT(DISTINCT model) as unique_models,
  SUM(access_count) as total_accesses,
  AVG(access_count) as avg_accesses_per_response,
  MAX(created_at) as latest_cache_entry,
  MIN(created_at) as oldest_cache_entry
FROM cached_responses;

-- RLS policies
ALTER TABLE cached_responses ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read their own cached responses
CREATE POLICY "Users can read their own cached responses"
  ON cached_responses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Policy for authenticated users to insert cached responses
CREATE POLICY "Users can insert cached responses"
  ON cached_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policy for service role to manage all cached responses
CREATE POLICY "Service role can manage all cached responses"
  ON cached_responses
  FOR ALL
  TO service_role
  USING (true);

-- Create a cleanup function for old cached responses
CREATE OR REPLACE FUNCTION cleanup_old_responses(days_old int DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM cached_responses
  WHERE created_at < NOW() - INTERVAL '1 day' * days_old
    AND access_count < 5; -- Keep frequently accessed responses longer

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;