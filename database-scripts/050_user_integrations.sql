-- =====================================================
-- USER INTEGRATIONS & INTEGRATION DOCUMENTS
-- Generic integration system for GitHub, LinkedIn, etc.
-- Uses pgvector for semantic search (RAG)
-- =====================================================

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. User Integrations table (generic for all providers)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  provider_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'syncing', 'error', 'disconnected')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- 2. Integration Documents table (chunked, embedded content)
CREATE TABLE IF NOT EXISTS public.integration_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes

-- IVFFlat index on embeddings filtered by user_id for fast similarity search
CREATE INDEX IF NOT EXISTS idx_integration_documents_embedding
  ON public.integration_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Composite index for upsert deduplication
CREATE INDEX IF NOT EXISTS idx_integration_documents_dedup
  ON public.integration_documents(user_id, provider, source_id, chunk_index);

-- Fast lookup by integration
CREATE INDEX IF NOT EXISTS idx_integration_documents_integration
  ON public.integration_documents(integration_id);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_integrations_user
  ON public.user_integrations(user_id);

-- 4. Row Level Security

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_documents ENABLE ROW LEVEL SECURITY;

-- user_integrations policies
CREATE POLICY "Users can view their own integrations"
  ON public.user_integrations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own integrations"
  ON public.user_integrations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own integrations"
  ON public.user_integrations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own integrations"
  ON public.user_integrations FOR DELETE
  USING (user_id = auth.uid());

-- integration_documents policies
CREATE POLICY "Users can view their own documents"
  ON public.integration_documents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own documents"
  ON public.integration_documents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own documents"
  ON public.integration_documents FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own documents"
  ON public.integration_documents FOR DELETE
  USING (user_id = auth.uid());

-- Service role bypass for background sync operations
CREATE POLICY "Service role full access to integrations"
  ON public.user_integrations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to documents"
  ON public.integration_documents FOR ALL
  USING (auth.role() = 'service_role');

-- 5. Search function for RAG retrieval
CREATE OR REPLACE FUNCTION search_user_integrations(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_threshold FLOAT DEFAULT 0.7,
  p_limit INT DEFAULT 5,
  p_provider_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  source_type TEXT,
  source_id TEXT,
  source_url TEXT,
  title TEXT,
  content TEXT,
  chunk_index INT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.provider,
    d.source_type,
    d.source_id,
    d.source_url,
    d.title,
    d.content,
    d.chunk_index,
    d.metadata,
    1 - (d.embedding <=> p_query_embedding) AS similarity
  FROM public.integration_documents d
  WHERE
    d.user_id = p_user_id
    AND d.embedding IS NOT NULL
    AND (p_provider_filter IS NULL OR d.provider = p_provider_filter)
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Permissions
GRANT EXECUTE ON FUNCTION search_user_integrations TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 7. Updated_at trigger
CREATE OR REPLACE FUNCTION update_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();

CREATE TRIGGER trigger_integration_documents_updated_at
  BEFORE UPDATE ON public.integration_documents
  FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();

-- 8. Comments
COMMENT ON TABLE public.user_integrations IS
  'Generic user integration connections (GitHub, LinkedIn, etc.)';

COMMENT ON TABLE public.integration_documents IS
  'Chunked, embedded content from user integrations for RAG retrieval';

COMMENT ON FUNCTION search_user_integrations IS
  'Semantic search over user integration documents using cosine similarity';

-- 9. Analyze tables
ANALYZE public.user_integrations;
ANALYZE public.integration_documents;
