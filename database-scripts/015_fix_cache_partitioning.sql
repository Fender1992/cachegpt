-- =====================================================
-- FIX CACHED_RESPONSES PARTITIONING
-- Ensures parent table and partitions are properly set up
-- =====================================================

-- First, check if cached_responses is already partitioned
-- If not, we need to recreate it as a partitioned table

-- Step 1: Rename existing table if it's not partitioned
DO $$
BEGIN
  -- Check if cached_responses exists and is not partitioned
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'cached_responses'
    AND schemaname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_partitioned_table
    WHERE partrelid = 'cached_responses'::regclass
  ) THEN
    -- Rename the old non-partitioned table
    ALTER TABLE cached_responses RENAME TO cached_responses_old;
  END IF;
END $$;

-- Step 2: Create partitioned parent table if it doesn't exist
CREATE TABLE IF NOT EXISTS cached_responses (
  id UUID DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  model VARCHAR(100),
  provider VARCHAR(100),
  embedding DOUBLE PRECISION[],
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
  access_count INTEGER DEFAULT 1,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tokens_used INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,6) DEFAULT 0,
  metadata JSONB DEFAULT '{}',

  -- Ranking columns
  popularity_score DECIMAL(10,4) DEFAULT 50.0,
  ranking_version INTEGER DEFAULT 1,
  ranking_metadata JSONB DEFAULT '{}',
  tier VARCHAR(20) DEFAULT 'cool',
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP WITH TIME ZONE,
  last_score_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 3: Create partitions for current and next few months
-- September 2025
CREATE TABLE IF NOT EXISTS cached_responses_2025_09
PARTITION OF cached_responses
FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

-- October 2025
CREATE TABLE IF NOT EXISTS cached_responses_2025_10
PARTITION OF cached_responses
FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

-- November 2025
CREATE TABLE IF NOT EXISTS cached_responses_2025_11
PARTITION OF cached_responses
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- December 2025
CREATE TABLE IF NOT EXISTS cached_responses_2025_12
PARTITION OF cached_responses
FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- January 2026
CREATE TABLE IF NOT EXISTS cached_responses_2026_01
PARTITION OF cached_responses
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Step 4: Migrate data from old table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'cached_responses_old') THEN
    -- Copy data from old table to new partitioned table
    INSERT INTO cached_responses
    SELECT * FROM cached_responses_old
    ON CONFLICT DO NOTHING;

    -- Drop the old table
    DROP TABLE cached_responses_old;
  END IF;
END $$;

-- Step 5: Create indexes on parent table (will be inherited by partitions)
CREATE INDEX IF NOT EXISTS idx_cached_responses_model_provider
ON cached_responses(model, provider);

CREATE INDEX IF NOT EXISTS idx_cached_responses_tier
ON cached_responses(tier) WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_cached_responses_popularity
ON cached_responses(popularity_score DESC) WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_cached_responses_created
ON cached_responses(created_at DESC);

-- Step 6: Add a function to automatically create new partitions
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  -- Get next month
  partition_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
  partition_name := 'cached_responses_' || TO_CHAR(partition_date, 'YYYY_MM');
  start_date := partition_date;
  end_date := partition_date + INTERVAL '1 month';

  -- Check if partition already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = partition_name
  ) THEN
    -- Create the partition
    EXECUTE format('CREATE TABLE %I PARTITION OF cached_responses FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Grant necessary permissions
GRANT ALL ON cached_responses TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- Add comment
COMMENT ON TABLE cached_responses IS 'Partitioned table for cached AI responses, partitioned by month';