-- Diagnostic script to check cached_responses table structure
-- Run this first to see what constraints exist

-- Check if table exists
SELECT
  'Table exists: ' || EXISTS(
    SELECT 1 FROM pg_tables
    WHERE tablename = 'cached_responses'
  )::text AS table_status;

-- Check primary key
SELECT
  'Primary key: ' || COALESCE(
    (SELECT string_agg(a.attname, ', ')
     FROM pg_constraint c
     JOIN pg_class t ON c.conrelid = t.oid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
     WHERE t.relname = 'cached_responses' AND c.contype = 'p'),
    'NONE'
  ) AS primary_key_columns;

-- Check all constraints
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  CASE contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    ELSE contype::text
  END AS constraint_description
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'cached_responses'
ORDER BY contype;

-- Check if id column exists and is unique
SELECT
  'ID column exists: ' || EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cached_responses' AND column_name = 'id'
  )::text AS id_column_status;

-- Check for unique constraint on id
SELECT
  'Unique constraint on id: ' || EXISTS(
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'cached_responses'
    AND a.attname = 'id'
    AND c.contype IN ('p', 'u')
  )::text AS unique_id_status;
