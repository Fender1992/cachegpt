-- Bug Tracker System Migration (Safe Version - Idempotent)
-- Created: September 29, 2025
-- Purpose: Admin-only bug tracking with user submission capability

-- Create bugs table
CREATE TABLE IF NOT EXISTS bugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'ui', 'performance', 'auth', 'api', 'mobile', 'cli')),
  user_email TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent TEXT,
  url TEXT,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  browser_info JSONB,
  screenshot_url TEXT,
  admin_notes TEXT,
  assigned_to TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_priority ON bugs(priority);
CREATE INDEX IF NOT EXISTS idx_bugs_category ON bugs(category);
CREATE INDEX IF NOT EXISTS idx_bugs_created_at ON bugs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bugs_user_email ON bugs(user_email);

-- Enable RLS
ALTER TABLE bugs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin can view all bugs" ON bugs;
DROP POLICY IF EXISTS "Users can submit bug reports" ON bugs;

-- RLS Policy: Only admin can view all bugs
CREATE POLICY "Admin can view all bugs" ON bugs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.uid() = auth.users.id
    AND auth.users.email = 'rolandofender@gmail.com'
  )
);

-- RLS Policy: Users can only insert their own bug reports
CREATE POLICY "Users can submit bug reports" ON bugs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR user_id IS NULL
);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_bugs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_bugs_updated_at ON bugs;
CREATE TRIGGER trigger_update_bugs_updated_at
  BEFORE UPDATE ON bugs
  FOR EACH ROW
  EXECUTE FUNCTION update_bugs_updated_at();

-- Create bug statistics view for admin dashboard
DROP VIEW IF EXISTS bug_statistics;
CREATE VIEW bug_statistics AS
SELECT
  COUNT(*) as total_bugs,
  COUNT(*) FILTER (WHERE status = 'open') as open_bugs,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_bugs,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_bugs,
  COUNT(*) FILTER (WHERE status = 'closed') as closed_bugs,
  COUNT(*) FILTER (WHERE priority = 'critical') as critical_bugs,
  COUNT(*) FILTER (WHERE priority = 'high') as high_priority_bugs,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as bugs_this_week,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as bugs_today,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
FROM bugs;

-- Grant permissions
GRANT ALL ON bugs TO authenticated;
GRANT SELECT ON bug_statistics TO authenticated;

-- Insert sample data for testing (optional) - only if table is empty
INSERT INTO bugs (title, description, status, priority, category, user_email, steps_to_reproduce, expected_behavior, actual_behavior)
SELECT
  'Mobile URL bar covers input',
  'On mobile devices, the browser URL bar covers the chat input field making it impossible to type',
  'resolved',
  'high',
  'mobile',
  'test@example.com',
  '1. Open chat on mobile\n2. Try to type message',
  'Input field should be visible and accessible',
  'Input field is covered by URL bar'
WHERE NOT EXISTS (SELECT 1 FROM bugs WHERE title = 'Mobile URL bar covers input');

INSERT INTO bugs (title, description, status, priority, category, user_email, steps_to_reproduce, expected_behavior, actual_behavior)
SELECT
  'Chat UI hard to read',
  'The dark theme makes it difficult to read messages',
  'resolved',
  'medium',
  'ui',
  'test@example.com',
  '1. Open chat interface\n2. Try to read messages',
  'Text should be clearly readable',
  'Low contrast makes text hard to read'
WHERE NOT EXISTS (SELECT 1 FROM bugs WHERE title = 'Chat UI hard to read');

COMMENT ON TABLE bugs IS 'Bug tracking system with admin-only access and user submission capability';
COMMENT ON COLUMN bugs.status IS 'Bug status: open, in_progress, resolved, closed';
COMMENT ON COLUMN bugs.priority IS 'Bug priority: low, medium, high, critical';
COMMENT ON COLUMN bugs.category IS 'Bug category for organization and filtering';
COMMENT ON COLUMN bugs.browser_info IS 'JSON object containing browser/device information';

-- Success message
SELECT 'Bug tracker system migration completed successfully!' as status;