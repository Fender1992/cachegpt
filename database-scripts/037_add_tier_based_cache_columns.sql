-- Migration 037: Add Tier-Based Cache Columns
-- Created: October 8, 2025
-- Purpose: Add missing columns for tier-based caching system

-- Add tier-based caching columns to cached_responses
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'cool' CHECK (tier IN ('hot', 'warm', 'cool', 'cold', 'frozen')),
ADD COLUMN IF NOT EXISTS popularity_score FLOAT DEFAULT 50.0,
ADD COLUMN IF NOT EXISTS ranking_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS ranking_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Add indexes for tier-based queries
CREATE INDEX IF NOT EXISTS idx_cached_responses_tier ON cached_responses(tier, popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_cached_responses_popularity ON cached_responses(popularity_score DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_cached_responses_archived ON cached_responses(is_archived, tier);

-- Update existing rows to have tier based on lifecycle (if they have lifecycle)
UPDATE cached_responses
SET tier = CASE
  WHEN lifecycle = 'hot' THEN 'hot'
  WHEN lifecycle = 'warm' THEN 'warm'
  WHEN lifecycle = 'cool' THEN 'cool'
  WHEN lifecycle = 'cold' THEN 'cold'
  WHEN lifecycle = 'stale' THEN 'frozen'
  ELSE 'cool'
END
WHERE tier IS NULL;

-- Calculate initial popularity scores based on access_count
UPDATE cached_responses
SET popularity_score = LEAST(100.0, 50.0 + (access_count * 2.0))
WHERE popularity_score IS NULL;

COMMENT ON COLUMN cached_responses.tier IS 'Cache tier for performance optimization: hot (frequently accessed), warm (moderately accessed), cool (rarely accessed), cold (very old), frozen (archived)';
COMMENT ON COLUMN cached_responses.popularity_score IS 'Calculated popularity score (0-100) based on access patterns, recency, and user feedback';
COMMENT ON COLUMN cached_responses.ranking_version IS 'Version of ranking algorithm used for this entry';
COMMENT ON COLUMN cached_responses.ranking_metadata IS 'Additional metadata for ranking calculations (response time, user info, etc.)';
COMMENT ON COLUMN cached_responses.is_archived IS 'Whether this entry has been archived to cold storage';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 037: Tier-Based Cache Columns added successfully';
  RAISE NOTICE 'Added columns: tier, popularity_score, ranking_version, ranking_metadata, last_score_update, is_archived';
  RAISE NOTICE 'Created indexes for tier-based queries';
  RAISE NOTICE 'Migrated existing lifecycle data to tier system';
END $$;
