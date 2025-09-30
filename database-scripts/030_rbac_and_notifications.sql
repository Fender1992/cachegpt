-- =====================================================
-- RBAC System and Bug Notification Setup
-- Created: September 30, 2025
-- Purpose: Replace hardcoded admin email with proper role-based access control
-- =====================================================

-- =====================================================
-- 1. USER ROLES TABLE
-- =====================================================

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'moderator', 'support')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;

-- RLS Policy: Users can view their own roles
CREATE POLICY "Users can view their own roles" ON user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Admins can manage all roles
CREATE POLICY "Admins can manage all roles" ON user_roles
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
    AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
  )
);

-- Grant permissions
GRANT ALL ON user_roles TO authenticated;

-- =====================================================
-- 2. HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(check_user_id UUID, check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = check_user_id
    AND role = check_role
    AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current user has a specific role
CREATE OR REPLACE FUNCTION current_user_has_role(check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN has_role(auth.uid(), check_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's roles
CREATE OR REPLACE FUNCTION get_user_roles(check_user_id UUID)
RETURNS TABLE(role TEXT, granted_at TIMESTAMP WITH TIME ZONE, expires_at TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
  RETURN QUERY
  SELECT user_roles.role, user_roles.granted_at, user_roles.expires_at
  FROM user_roles
  WHERE user_roles.user_id = check_user_id
  AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
  ORDER BY user_roles.granted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. UPDATE BUGS TABLE RLS POLICIES
-- =====================================================

-- Drop old admin policy
DROP POLICY IF EXISTS "Admin can view all bugs" ON bugs;

-- Create new role-based policy for admins/moderators
CREATE POLICY "Admins and moderators can manage all bugs" ON bugs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'moderator')
    AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
  )
);

-- IMPORTANT: Preserve the user submission policy (don't drop it!)
-- This policy allows anyone (authenticated or anonymous) to submit bugs
-- It was created in 026_bug_tracker_system.sql
-- If it doesn't exist, create it:
DROP POLICY IF EXISTS "Users can submit bug reports" ON bugs;
CREATE POLICY "Users can submit bug reports" ON bugs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR user_id IS NULL
);

-- =====================================================
-- 4. BUG NOTIFICATIONS TABLE
-- =====================================================

-- Create bug_notifications table for email queue
CREATE TABLE IF NOT EXISTS bug_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_bug', 'status_update', 'priority_update', 'assignment')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bug_notifications_bug_id ON bug_notifications(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_notifications_status ON bug_notifications(status);
CREATE INDEX IF NOT EXISTS idx_bug_notifications_created_at ON bug_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE bug_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all notifications
CREATE POLICY "Admins can view all notifications" ON bug_notifications
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
    AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
  )
);

-- Grant permissions
GRANT ALL ON bug_notifications TO authenticated;

-- =====================================================
-- 5. NOTIFICATION TRIGGERS
-- =====================================================

-- Function to queue notification for new bugs
CREATE OR REPLACE FUNCTION notify_admins_on_new_bug()
RETURNS TRIGGER AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Only notify for high and critical priority bugs
  IF NEW.priority IN ('high', 'critical') THEN
    -- Insert notification for each admin
    FOR admin_record IN
      SELECT DISTINCT u.id, u.email
      FROM auth.users u
      INNER JOIN user_roles ur ON u.id = ur.user_id
      WHERE ur.role = 'admin'
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND u.email IS NOT NULL
    LOOP
      INSERT INTO bug_notifications (
        bug_id,
        recipient_email,
        recipient_user_id,
        notification_type,
        metadata
      ) VALUES (
        NEW.id,
        admin_record.email,
        admin_record.id,
        'new_bug',
        jsonb_build_object(
          'priority', NEW.priority,
          'category', NEW.category,
          'title', NEW.title
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new bug notifications
DROP TRIGGER IF EXISTS trigger_notify_admins_on_new_bug ON bugs;
CREATE TRIGGER trigger_notify_admins_on_new_bug
  AFTER INSERT ON bugs
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_on_new_bug();

-- =====================================================
-- 6. MIGRATE EXISTING ADMIN
-- =====================================================

-- Insert admin role for existing admin email
INSERT INTO user_roles (user_id, role, granted_by, metadata)
SELECT
  id,
  'admin',
  id, -- Self-granted for initial admin
  jsonb_build_object(
    'migrated_from', 'hardcoded_email',
    'original_email', 'rolandofender@gmail.com',
    'migration_date', NOW()
  )
FROM auth.users
WHERE email = 'rolandofender@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- =====================================================
-- 7. AUDIT LOG TABLE (BONUS)
-- =====================================================

-- Create audit log for tracking admin actions
CREATE TABLE IF NOT EXISTS bug_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'status_changed', 'priority_changed', 'assigned')),
  old_values JSONB,
  new_values JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bug_audit_log_bug_id ON bug_audit_log(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_audit_log_user_id ON bug_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_audit_log_created_at ON bug_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE bug_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs" ON bug_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
    AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
  )
);

-- Grant permissions
GRANT SELECT ON bug_audit_log TO authenticated;

-- Function to log bug changes
CREATE OR REPLACE FUNCTION log_bug_changes()
RETURNS TRIGGER AS $$
DECLARE
  old_json JSONB;
  new_json JSONB;
  action_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
    old_json := NULL;
    new_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    -- Determine specific action
    IF OLD.status != NEW.status THEN
      action_type := 'status_changed';
    ELSIF OLD.priority != NEW.priority THEN
      action_type := 'priority_changed';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      action_type := 'assigned';
    ELSE
      action_type := 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'deleted';
    old_json := to_jsonb(OLD);
    new_json := NULL;
  END IF;

  INSERT INTO bug_audit_log (
    bug_id,
    user_id,
    user_email,
    action,
    old_values,
    new_values,
    metadata
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    action_type,
    old_json,
    new_json,
    jsonb_build_object('trigger_op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS trigger_log_bug_changes ON bugs;
CREATE TRIGGER trigger_log_bug_changes
  AFTER INSERT OR UPDATE OR DELETE ON bugs
  FOR EACH ROW
  EXECUTE FUNCTION log_bug_changes();

-- =====================================================
-- 8. ADMIN MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to grant role to user (admin only)
CREATE OR REPLACE FUNCTION grant_user_role(
  target_user_id UUID,
  target_role TEXT,
  expires TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if caller is admin
  IF NOT current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can grant roles';
  END IF;

  -- Insert role
  INSERT INTO user_roles (user_id, role, granted_by, expires_at)
  VALUES (target_user_id, target_role, auth.uid(), expires)
  ON CONFLICT (user_id, role)
  DO UPDATE SET
    granted_by = auth.uid(),
    expires_at = expires,
    granted_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke role from user (admin only)
CREATE OR REPLACE FUNCTION revoke_user_role(
  target_user_id UUID,
  target_role TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if caller is admin
  IF NOT current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can revoke roles';
  END IF;

  -- Delete role
  DELETE FROM user_roles
  WHERE user_id = target_user_id
  AND role = target_role;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON TABLE user_roles IS 'Role-based access control (RBAC) for users';
COMMENT ON TABLE bug_notifications IS 'Queue for email notifications about bugs';
COMMENT ON TABLE bug_audit_log IS 'Audit trail of all bug changes';

COMMENT ON COLUMN user_roles.role IS 'Role type: user, admin, moderator, support';
COMMENT ON COLUMN user_roles.expires_at IS 'Optional expiry time for temporary roles';
COMMENT ON COLUMN bug_notifications.status IS 'Notification status: pending, sent, failed';
COMMENT ON COLUMN bug_notifications.retry_count IS 'Number of send attempts';

COMMENT ON FUNCTION has_role IS 'Check if a user has a specific role';
COMMENT ON FUNCTION current_user_has_role IS 'Check if current authenticated user has a specific role';
COMMENT ON FUNCTION get_user_roles IS 'Get all active roles for a user';
COMMENT ON FUNCTION grant_user_role IS 'Grant a role to a user (admin only)';
COMMENT ON FUNCTION revoke_user_role IS 'Revoke a role from a user (admin only)';

-- =====================================================
-- 10. SUCCESS MESSAGE
-- =====================================================

SELECT
  'RBAC system migration completed successfully!' as status,
  (SELECT COUNT(*) FROM user_roles WHERE role = 'admin') as admin_count,
  (SELECT COUNT(*) FROM bug_notifications WHERE status = 'pending') as pending_notifications;
