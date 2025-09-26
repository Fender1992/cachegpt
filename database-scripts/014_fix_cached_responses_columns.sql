-- =====================================================
-- FIX CACHED_RESPONSES TABLE - ADD MISSING COLUMNS
-- This migration adds the provider column and ensures all ranking columns exist
-- =====================================================

-- Add provider column if it doesn't exist
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS provider VARCHAR(100);

-- Ensure all ranking columns exist (from 011_progressive_ranking_system.sql)
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS popularity_score DECIMAL(10,4) DEFAULT 50.0,
ADD COLUMN IF NOT EXISTS ranking_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS ranking_metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'cool',
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_cached_responses_provider ON cached_responses(provider);
CREATE INDEX IF NOT EXISTS idx_cached_responses_model_provider ON cached_responses(model, provider);
CREATE INDEX IF NOT EXISTS idx_cached_responses_popularity ON cached_responses(popularity_score DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_cached_responses_tier ON cached_responses(tier) WHERE is_archived = false;

-- Add RPC function for updating popularity score if missing
CREATE OR REPLACE FUNCTION calculate_and_update_popularity_score(
  p_cached_response_id UUID
) RETURNS VOID AS $$
DECLARE
  v_score DECIMAL;
  v_record RECORD;
BEGIN
  -- Get the record
  SELECT * INTO v_record
  FROM cached_responses
  WHERE id = p_cached_response_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate new score based on access patterns
  v_score := LEAST(100,
    LN(v_record.access_count + 1) * 20 +  -- Access frequency (0-100)
    (100 * EXP(-EXTRACT(EPOCH FROM (NOW() - v_record.last_accessed)) / 604800)) * 0.3 +  -- Recency (week decay)
    LEAST(100, COALESCE(v_record.cost_saved, 0) * 1000) * 0.2  -- Economic value
  );

  -- Update the record
  UPDATE cached_responses
  SET
    popularity_score = v_score,
    tier = CASE
      WHEN v_score >= 80 THEN 'hot'
      WHEN v_score >= 60 THEN 'warm'
      WHEN v_score >= 40 THEN 'cool'
      WHEN v_score >= 20 THEN 'cold'
      ELSE 'frozen'
    END,
    last_score_update = NOW()
  WHERE id = p_cached_response_id;
END;
$$ LANGUAGE plpgsql;

-- Update existing records to have provider='mixed' if they don't have one
UPDATE cached_responses
SET provider = 'mixed'
WHERE provider IS NULL;

-- Make provider NOT NULL after setting defaults
ALTER TABLE cached_responses
ALTER COLUMN provider SET NOT NULL;

-- Add default value for future inserts
ALTER TABLE cached_responses
ALTER COLUMN provider SET DEFAULT 'mixed';