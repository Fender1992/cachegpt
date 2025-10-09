-- Migration 039: Shared Answers
-- Created: October 8, 2025
-- Purpose: Enable shareable public answer pages with expiration and OG previews

-- Create shared_answers table
CREATE TABLE IF NOT EXISTS public.shared_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  content_md TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_public BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]{6,32}$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_answers_slug ON public.shared_answers(slug);
CREATE INDEX IF NOT EXISTS idx_shared_answers_owner ON public.shared_answers(owner);
CREATE INDEX IF NOT EXISTS idx_shared_answers_created ON public.shared_answers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_answers_expires ON public.shared_answers(expires_at) WHERE expires_at IS NOT NULL;

-- RLS policies
ALTER TABLE public.shared_answers ENABLE ROW LEVEL SECURITY;

-- Anyone can view public, non-expired shares
CREATE POLICY "Public shares are viewable" ON public.shared_answers
  FOR SELECT
  USING (
    is_public = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Users can create their own shares
CREATE POLICY "Users can create shares" ON public.shared_answers
  FOR INSERT
  WITH CHECK (owner = auth.uid() OR owner IS NULL);

-- Users can view their own shares (even private/expired)
CREATE POLICY "Users can view own shares" ON public.shared_answers
  FOR SELECT
  USING (owner = auth.uid());

-- Users can update their own shares
CREATE POLICY "Users can update own shares" ON public.shared_answers
  FOR UPDATE
  USING (owner = auth.uid());

-- Users can delete their own shares
CREATE POLICY "Users can delete own shares" ON public.shared_answers
  FOR DELETE
  USING (owner = auth.uid());

-- Comments
COMMENT ON TABLE public.shared_answers IS 'Shareable public answer pages with expiration for virality';
COMMENT ON COLUMN public.shared_answers.slug IS 'URL-safe unique identifier (6-32 chars)';
COMMENT ON COLUMN public.shared_answers.owner IS 'User who created share (NULL for guests)';
COMMENT ON COLUMN public.shared_answers.expires_at IS 'Expiration time for guest shares (30 days)';
COMMENT ON COLUMN public.shared_answers.view_count IS 'Number of times this share was viewed';

-- Function to auto-purge expired guest shares (called by cron)
CREATE OR REPLACE FUNCTION purge_expired_shares()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.shared_answers
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND owner IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION purge_expired_shares IS 'Purges expired guest shares (run daily via cron)';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 039: Shared Answers table created successfully';
  RAISE NOTICE 'RLS policies enabled for public viewing and user ownership';
  RAISE NOTICE 'Auto-purge function created: purge_expired_shares()';
END $$;
