-- =====================================================
-- Migration 031: Cache Lifecycle and Metadata System
-- =====================================================
-- Purpose: Add intelligent cache lifecycle management with metadata scanning
-- Date: October 1, 2025
--
-- Features:
-- 1. Lifecycle stages (hot, warm, cool, cold, stale)
-- 2. Enhanced metadata tracking (access patterns, query types, context)
-- 3. Automated cleanup and optimization
-- 4. Cache health monitoring
-- =====================================================

-- Add lifecycle and metadata columns to cached_responses
ALTER TABLE cached_responses
ADD COLUMN IF NOT EXISTS lifecycle VARCHAR(20) DEFAULT 'hot' CHECK (lifecycle IN ('hot', 'warm', 'cool', 'cold', 'stale')),
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS query_type VARCHAR(50) DEFAULT 'general' CHECK (query_type IN ('general', 'static', 'dynamic', 'time-sensitive', 'factual', 'creative')),
ADD COLUMN IF NOT EXISTS context_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS user_feedback VARCHAR(20) CHECK (user_feedback IN ('helpful', 'outdated', 'incorrect', NULL)),
ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add index for lifecycle-based queries
CREATE INDEX IF NOT EXISTS idx_cached_responses_lifecycle ON cached_responses(lifecycle, last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_cached_responses_access_count ON cached_responses(access_count DESC);
CREATE INDEX IF NOT EXISTS idx_cached_responses_context_hash ON cached_responses(context_hash);
CREATE INDEX IF NOT EXISTS idx_cached_responses_query_type ON cached_responses(query_type, lifecycle);

-- Create cache_lifecycle_stats table for monitoring
CREATE TABLE IF NOT EXISTS cache_lifecycle_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date DATE DEFAULT CURRENT_DATE,
  hot_count INTEGER DEFAULT 0,
  warm_count INTEGER DEFAULT 0,
  cool_count INTEGER DEFAULT 0,
  cold_count INTEGER DEFAULT 0,
  stale_count INTEGER DEFAULT 0,
  total_entries INTEGER DEFAULT 0,
  deleted_count INTEGER DEFAULT 0,
  promoted_count INTEGER DEFAULT 0,
  demoted_count INTEGER DEFAULT 0,
  avg_access_count FLOAT DEFAULT 0.0,
  avg_age_days FLOAT DEFAULT 0.0,
  cache_health_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(scan_date)
);

-- Create cache_feedback table for user feedback
-- Note: Foreign key to cached_responses not added because cached_responses is a partitioned table
-- Partitioned tables can't be referenced by foreign keys in PostgreSQL
-- Instead, application-level referential integrity is maintained via cache-lifecycle.ts
CREATE TABLE IF NOT EXISTS cache_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cached_response_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('helpful', 'outdated', 'incorrect')),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_feedback_response_id ON cache_feedback(cached_response_id);
CREATE INDEX IF NOT EXISTS idx_cache_feedback_type ON cache_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_cache_feedback_created_at ON cache_feedback(created_at DESC);

-- =====================================================
-- Helper Functions for Lifecycle Management
-- =====================================================

-- Function to calculate cache age in days
CREATE OR REPLACE FUNCTION calculate_cache_age_days(created_timestamp TIMESTAMP WITH TIME ZONE)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(EPOCH FROM (NOW() - created_timestamp)) / 86400;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate days since last access
CREATE OR REPLACE FUNCTION calculate_days_since_access(last_access TIMESTAMP WITH TIME ZONE)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(EPOCH FROM (NOW() - last_access)) / 86400;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to determine appropriate lifecycle stage
CREATE OR REPLACE FUNCTION determine_cache_lifecycle(
  age_days INTEGER,
  days_since_access INTEGER,
  access_cnt INTEGER,
  query_typ VARCHAR,
  feedback VARCHAR
)
RETURNS VARCHAR AS $$
BEGIN
  -- User feedback overrides
  IF feedback = 'outdated' OR feedback = 'incorrect' THEN
    RETURN 'stale';
  END IF;

  -- Time-sensitive queries expire faster
  IF query_typ = 'time-sensitive' AND age_days > 7 THEN
    RETURN 'stale';
  END IF;

  -- Popular queries stay hot longer
  IF access_cnt > 100 AND days_since_access < 7 THEN
    RETURN 'hot';
  END IF;

  IF access_cnt > 50 AND days_since_access < 14 THEN
    RETURN 'warm';
  END IF;

  -- Old and unpopular = remove
  IF age_days > 90 AND access_cnt < 5 THEN
    RETURN 'cold';
  END IF;

  -- Dynamic content needs fresher data
  IF query_typ = 'dynamic' AND age_days > 14 THEN
    RETURN 'cool';
  END IF;

  -- Static/factual content can last longer
  IF query_typ IN ('static', 'factual') THEN
    IF age_days < 14 THEN RETURN 'hot';
    ELSIF age_days < 60 THEN RETURN 'warm';
    ELSIF age_days < 120 THEN RETURN 'cool';
    ELSE RETURN 'cold';
    END IF;
  END IF;

  -- Default age-based transitions
  IF age_days < 7 THEN
    RETURN 'hot';
  ELSIF age_days < 30 THEN
    RETURN 'warm';
  ELSIF age_days < 90 THEN
    RETURN 'cool';
  ELSE
    RETURN 'cold';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate cache health score (0-100)
CREATE OR REPLACE FUNCTION calculate_cache_health_score(
  hot_cnt INTEGER,
  warm_cnt INTEGER,
  cool_cnt INTEGER,
  cold_cnt INTEGER,
  stale_cnt INTEGER,
  total INTEGER
)
RETURNS FLOAT AS $$
DECLARE
  hot_score FLOAT;
  warm_score FLOAT;
  cool_score FLOAT;
  cold_score FLOAT;
  stale_penalty FLOAT;
BEGIN
  IF total = 0 THEN
    RETURN 0.0;
  END IF;

  -- Calculate weighted scores
  hot_score := (hot_cnt::FLOAT / total) * 100 * 1.0;    -- Hot entries: full value
  warm_score := (warm_cnt::FLOAT / total) * 100 * 0.75; -- Warm entries: 75% value
  cool_score := (cool_cnt::FLOAT / total) * 100 * 0.5;  -- Cool entries: 50% value
  cold_score := (cold_cnt::FLOAT / total) * 100 * 0.25; -- Cold entries: 25% value
  stale_penalty := (stale_cnt::FLOAT / total) * 100;    -- Stale entries: penalty

  RETURN GREATEST(0, hot_score + warm_score + cool_score + cold_score - stale_penalty);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Trigger to update last_accessed on cache hit
-- =====================================================

CREATE OR REPLACE FUNCTION update_cache_access_metadata()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed := NOW();
  NEW.access_count := OLD.access_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger should be called manually when cache is accessed
-- to avoid automatic updates on every SELECT

-- =====================================================
-- RLS Policies for new tables
-- =====================================================

-- Enable RLS
ALTER TABLE cache_lifecycle_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_feedback ENABLE ROW LEVEL SECURITY;

-- Admin can view all lifecycle stats
CREATE POLICY "Admins can view lifecycle stats" ON cache_lifecycle_stats
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Users can submit feedback (authenticated or anonymous)
CREATE POLICY "Users can submit cache feedback" ON cache_feedback
FOR INSERT
WITH CHECK (true);

-- Users can view their own feedback
CREATE POLICY "Users can view their feedback" ON cache_feedback
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback" ON cache_feedback
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- =====================================================
-- Migration Complete
-- =====================================================

COMMENT ON TABLE cache_lifecycle_stats IS 'Tracks cache health metrics and lifecycle distribution over time';
COMMENT ON TABLE cache_feedback IS 'User feedback on cached response quality and relevance';
COMMENT ON COLUMN cached_responses.lifecycle IS 'Current lifecycle stage: hot (0-7d), warm (8-30d), cool (31-90d), cold (90+d), stale (marked for deletion)';
COMMENT ON COLUMN cached_responses.query_type IS 'Query classification for intelligent TTL: general, static, dynamic, time-sensitive, factual, creative';
COMMENT ON COLUMN cached_responses.context_hash IS 'Hash of context enrichment used, for invalidation when context changes';
COMMENT ON COLUMN cached_responses.user_feedback IS 'Aggregated user feedback: helpful, outdated, incorrect';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 031: Cache Lifecycle and Metadata System completed successfully';
  RAISE NOTICE 'Added lifecycle stages: hot, warm, cool, cold, stale';
  RAISE NOTICE 'Added metadata tracking: access patterns, query types, context hashing';
  RAISE NOTICE 'Created cache_lifecycle_stats and cache_feedback tables';
  RAISE NOTICE 'Created helper functions for lifecycle determination';
END $$;
