-- Fix bug notification trigger to notify for ALL priorities, not just high/critical
-- Issue: Trigger only created notifications for high/critical bugs, missing medium/low
-- Fix: Remove priority filter so admins get notified about all bug submissions

-- Drop and recreate the function
CREATE OR REPLACE FUNCTION notify_admins_on_new_bug()
RETURNS TRIGGER AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Notify for ALL bugs regardless of priority
  -- Admins can filter by priority in their email client or admin panel
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists, just updated the function
-- The existing trigger will use the new function automatically:
-- CREATE TRIGGER trigger_notify_admins_on_new_bug
--   AFTER INSERT ON bugs
--   FOR EACH ROW
--   EXECUTE FUNCTION notify_admins_on_new_bug();

COMMENT ON FUNCTION notify_admins_on_new_bug() IS 'Creates email notifications for all new bug reports (all priorities)';
