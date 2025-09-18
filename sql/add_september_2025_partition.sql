-- Add partition for September 2025
-- Run this if you get "no partition of relation cached_responses found for row" error

-- Check if table is partitioned
DO $$
BEGIN
  -- Try to create September 2025 partition
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'cached_responses_2025_09'
  ) THEN
    EXECUTE 'CREATE TABLE cached_responses_2025_09 PARTITION OF cached_responses FOR VALUES FROM (''2025-09-01'') TO (''2025-10-01'')';
    RAISE NOTICE 'Created partition cached_responses_2025_09';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- If cached_responses is not partitioned, ignore
    RAISE NOTICE 'Table cached_responses is not partitioned or does not exist';
  WHEN duplicate_table THEN
    -- Partition already exists
    RAISE NOTICE 'Partition already exists';
END $$;

-- Alternative: If your table is not partitioned, you can use the simple version
-- In that case, no partition is needed and inserts should work directly