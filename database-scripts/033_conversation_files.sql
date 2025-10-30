-- Migration: Conversation Files System
-- Version: 033
-- Description: Add support for file uploads in conversations
-- Created: 2025-10-30

-- Table: conversation_files
-- Stores uploaded files associated with conversations
CREATE TABLE IF NOT EXISTS conversation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- File metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- MIME type
  file_size INTEGER NOT NULL, -- bytes
  file_extension TEXT, -- .pdf, .txt, etc.

  -- File content and storage
  content_text TEXT, -- Extracted text content
  content_preview TEXT, -- First 200 chars for display
  storage_path TEXT, -- If we move to Supabase Storage later

  -- Metadata
  upload_source TEXT DEFAULT 'web', -- web, api, cli
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_file_size CHECK (file_size > 0 AND file_size <= 31457280) -- 30MB limit
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_files_conversation_id
  ON conversation_files(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_files_user_id
  ON conversation_files(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_files_created_at
  ON conversation_files(created_at DESC);

-- RLS Policies
ALTER TABLE conversation_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own files
CREATE POLICY conversation_files_select_own
  ON conversation_files
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can insert their own files
CREATE POLICY conversation_files_insert_own
  ON conversation_files
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own files
CREATE POLICY conversation_files_delete_own
  ON conversation_files
  FOR DELETE
  USING (user_id = auth.uid());

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_conversation_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_files_updated_at
  BEFORE UPDATE ON conversation_files
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_files_updated_at();

-- View: conversation_files_with_details
-- Provides file info with conversation context
CREATE OR REPLACE VIEW conversation_files_with_details AS
SELECT
  cf.id,
  cf.conversation_id,
  cf.user_id,
  cf.file_name,
  cf.file_type,
  cf.file_size,
  cf.file_extension,
  cf.content_preview,
  cf.created_at,
  c.title as conversation_title,
  u.email as user_email
FROM conversation_files cf
LEFT JOIN conversations c ON cf.conversation_id = c.id
LEFT JOIN auth.users u ON cf.user_id = u.id;

-- Function: get_conversation_files
-- Get all files for a conversation
CREATE OR REPLACE FUNCTION get_conversation_files(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  file_extension TEXT,
  content_preview TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cf.id,
    cf.file_name,
    cf.file_type,
    cf.file_size,
    cf.file_extension,
    cf.content_preview,
    cf.created_at
  FROM conversation_files cf
  WHERE cf.conversation_id = p_conversation_id
    AND cf.user_id = p_user_id
  ORDER BY cf.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: delete_old_orphaned_files
-- Clean up files from deleted conversations (should be handled by CASCADE)
-- But also delete files older than 90 days with no conversation
CREATE OR REPLACE FUNCTION delete_old_orphaned_files()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM conversation_files
  WHERE conversation_id IS NULL
    AND created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE conversation_files IS 'Stores uploaded files for conversations';
COMMENT ON COLUMN conversation_files.content_text IS 'Extracted text content for AI processing';
COMMENT ON COLUMN conversation_files.content_preview IS 'First 200 characters for UI display';
COMMENT ON COLUMN conversation_files.storage_path IS 'Future: Supabase Storage path for large files';
