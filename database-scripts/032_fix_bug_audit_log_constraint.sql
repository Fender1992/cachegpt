-- =====================================================
-- Migration 032: Fix Bug Audit Log Foreign Key Constraint
-- =====================================================
-- Purpose: Allow audit log to record deletions without FK constraint violation
-- Date: October 1, 2025
--
-- Issue: DELETE trigger tries to insert audit log AFTER bug is deleted,
-- causing foreign key constraint violation
--
-- Solution: Drop FK constraint, allow bug_id to exist even after bug deletion
-- =====================================================

-- Drop the foreign key constraint
ALTER TABLE bug_audit_log
DROP CONSTRAINT IF EXISTS bug_audit_log_bug_id_fkey;

-- Add comment explaining why no FK
COMMENT ON COLUMN bug_audit_log.bug_id IS 'Bug ID - No FK constraint to allow audit trail after bug deletion';

-- Ensure bug_id is indexed for performance (already exists but reaffirm)
CREATE INDEX IF NOT EXISTS idx_bug_audit_log_bug_id ON bug_audit_log(bug_id);

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 032: Fixed bug_audit_log foreign key constraint';
  RAISE NOTICE 'Audit logs can now be created for deleted bugs';
END $$;
