-- =====================================================
-- Quick Fix for RLS Infinite Recursion
-- Run this in Supabase SQL Editor
-- =====================================================

-- Fix user_roles policies (removes infinite recursion)
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins can manage all roles" ON user_roles
FOR ALL
USING (current_user_has_role('admin'));

-- Fix bugs policy
DROP POLICY IF EXISTS "Admins and moderators can manage all bugs" ON bugs;
CREATE POLICY "Admins and moderators can manage all bugs" ON bugs
FOR ALL
USING (current_user_has_role('admin') OR current_user_has_role('moderator'));

-- Fix bug_notifications policy
DROP POLICY IF EXISTS "Admins can view all notifications" ON bug_notifications;
CREATE POLICY "Admins can view all notifications" ON bug_notifications
FOR ALL
USING (current_user_has_role('admin'));

-- Fix bug_audit_log policy
DROP POLICY IF EXISTS "Admins can view all audit logs" ON bug_audit_log;
CREATE POLICY "Admins can view all audit logs" ON bug_audit_log
FOR SELECT
USING (current_user_has_role('admin'));

-- Verify policies were created
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('user_roles', 'bugs', 'bug_notifications', 'bug_audit_log')
ORDER BY tablename, policyname;
