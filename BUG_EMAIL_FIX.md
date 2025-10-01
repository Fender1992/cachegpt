# Bug Email Notification Fix

## Problem

Bug submission emails were not being sent to admins despite cron jobs being configured and running.

## Root Cause

The database trigger `notify_admins_on_new_bug()` only created email notifications for **HIGH** and **CRITICAL** priority bugs:

```sql
IF NEW.priority IN ('high', 'critical') THEN
  -- Create notifications...
END IF;
```

However, the bug report form defaults to **MEDIUM** priority, so most bug submissions were being silently ignored for email notifications.

## Solution

Created migration `033_fix_bug_notifications_all_priorities.sql` that removes the priority filter, so admins are notified about **ALL** bug submissions regardless of priority.

### Changes Made

1. **Updated trigger function** to notify for all priorities
2. **Reasoning**: Admins should be aware of all bugs, they can filter by priority in their email client or admin panel if needed

### How to Apply

#### Option 1: Run migration via Supabase Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Paste contents of `/database-scripts/033_fix_bug_notifications_all_priorities.sql`
3. Click "Run"

#### Option 2: Run via psql command line
```bash
psql $DATABASE_URL -f database-scripts/033_fix_bug_notifications_all_priorities.sql
```

## How Email Notifications Work

### Flow
1. User submits bug → Inserted into `bugs` table
2. **Database trigger** automatically creates record in `bug_notifications` table
3. **Cron job** (`/api/cron/process-notifications`) runs every 5 minutes
4. Cron job reads pending notifications from `bug_notifications` table
5. Emails are sent via configured provider (Supabase/Resend/SendGrid/Console)
6. Notification status updated to 'sent' or 'failed'

### Cron Job Configuration

The cron job should be configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/process-notifications",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Or manually trigger via:
```bash
curl -X POST https://cachegpt.app/api/cron/process-notifications \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Email Provider Configuration

Emails are sent using the first available provider:

1. **Supabase** (default) - Uses built-in Resend integration
   - Requires: `SUPABASE_SERVICE_KEY`
   - From: `EMAIL_FROM` or 'notifications@cachegpt.app'

2. **Resend** (direct)
   - Requires: `RESEND_API_KEY`

3. **SendGrid**
   - Requires: `SENDGRID_API_KEY`

4. **Postmark**
   - Requires: `POSTMARK_API_KEY`

5. **Console** (development)
   - Logs emails to console instead of sending

### Environment Variables

```bash
# Email sender (optional, defaults to notifications@cachegpt.app)
EMAIL_FROM=notifications@cachegpt.app

# Email provider API key (choose one)
RESEND_API_KEY=re_...
SENDGRID_API_KEY=SG...
POSTMARK_API_KEY=...

# Cron authentication
CRON_SECRET=your_secret_here
```

## Testing

### 1. Verify Admin is in user_roles Table

```sql
SELECT u.email, ur.role
FROM auth.users u
JOIN user_roles ur ON u.id = ur.user_id
WHERE ur.role = 'admin';
```

If no admins, add one:
```sql
INSERT INTO user_roles (user_id, role, granted_by, metadata)
SELECT
  id,
  'admin',
  id,
  '{}'::jsonb
FROM auth.users
WHERE email = 'your-admin-email@example.com';
```

### 2. Test Bug Submission

1. Go to app and submit a test bug
2. Check `bug_notifications` table:
```sql
SELECT * FROM bug_notifications ORDER BY created_at DESC LIMIT 5;
```

3. Manually trigger cron:
```bash
curl https://cachegpt.app/api/cron/process-notifications
```

4. Check email inbox for notification

### 3. Debug Issues

**No notifications in bug_notifications table?**
- Check if admin exists in user_roles
- Verify trigger is installed: `\df notify_admins_on_new_bug`
- Check trigger is attached: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_notify_admins_on_new_bug';`

**Notifications stuck in 'pending' status?**
- Check email provider configuration
- Verify `CRON_SECRET` is set
- Check cron job logs in Vercel dashboard
- Manually trigger cron to see errors

**Emails not being received?**
- Check spam folder
- Verify email provider is configured correctly
- Check Resend/SendGrid dashboard for delivery status
- Look for error messages in `bug_notifications.error_message` column

## Related Files

- `/database-scripts/033_fix_bug_notifications_all_priorities.sql` - Migration fix
- `/database-scripts/030_rbac_and_notifications.sql` - Original trigger setup
- `/lib/email-notifications.ts` - Email sending logic
- `/app/api/cron/process-notifications/route.ts` - Cron job handler
- `/app/api/bugs/report/route.ts` - Bug submission endpoint

## Verification Checklist

- [ ] Migration applied to production database
- [ ] Test bug submitted successfully
- [ ] Notification record created in bug_notifications table
- [ ] Cron job runs without errors
- [ ] Admin receives email notification
- [ ] Email has correct priority badge and bug details
- [ ] "View in Bug Tracker" link works

## Future Improvements

1. Add email preferences for admins (opt-out of low priority bugs)
2. Implement digest emails (daily summary instead of per-bug)
3. Add Slack/Discord webhook integration
4. Create admin dashboard to manage notification preferences
5. Add email templates for different notification types
