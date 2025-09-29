-- Update resolved bugs with proper resolved_at timestamps
-- Run this after the initial migration to fix the sample data

UPDATE bugs
SET resolved_at = '2025-09-29 18:15:00+00'::timestamptz
WHERE status = 'resolved' AND resolved_at IS NULL;

-- You can run this query to see the updated bug reports:
-- SELECT id, title, status, priority, resolved_at, created_at FROM bugs ORDER BY created_at DESC;