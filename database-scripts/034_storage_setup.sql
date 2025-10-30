-- Migration: Supabase Storage Helper Functions
-- Version: 034
-- Description: Helper functions for Supabase Storage integration
-- Created: 2025-10-30

-- ============================================================================
-- IMPORTANT: MANUAL SETUP REQUIRED
-- ============================================================================
--
-- Storage buckets and RLS policies MUST be created via Supabase Dashboard.
-- You cannot create them via SQL due to permissions.
--
-- Follow the complete guide: /docs/SUPABASE_STORAGE_SETUP.md
--
-- Quick steps:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create bucket: "conversation-files" (private)
-- 3. Create RLS policies via Dashboard UI (see guide)
-- 4. Run this SQL file to create helper functions
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Generate storage path for user file
-- Returns: {user_id}/{conversation_id}/{file_id}.{extension}
CREATE OR REPLACE FUNCTION generate_storage_path(
  p_user_id UUID,
  p_conversation_id UUID,
  p_file_id UUID,
  p_extension TEXT
)
RETURNS TEXT AS $$
BEGIN
  RETURN format('%s/%s/%s%s',
    p_user_id::text,
    COALESCE(p_conversation_id::text, 'unlinked'),
    p_file_id::text,
    p_extension
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get signed URL for file download
-- This is a placeholder - actual signing happens in application code
-- But we can validate the path belongs to the user
CREATE OR REPLACE FUNCTION validate_storage_access(
  p_storage_path TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the path starts with the user's ID
  RETURN p_storage_path LIKE (p_user_id::text || '/%');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_storage_path IS 'Generates consistent storage path: {user_id}/{conversation_id}/{file_id}.{ext}';
COMMENT ON FUNCTION validate_storage_access IS 'Validates that a storage path belongs to the specified user';
