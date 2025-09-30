# Validate Email System

## Quick Validation Steps

Since your environment variables are in Vercel (not local `.env` files), here's how to validate your email system is working:

---

## Method 1: Submit a Test Bug (Recommended)

This tests the entire flow end-to-end:

### Step 1: Submit a High Priority Bug
1. Go to **https://cachegpt.app** (or your domain)
2. Click the **red bug button** (bottom right)
3. Fill in:
   - **Title**: "Test Email Notification"
   - **Description**: "Testing the email notification system"
   - **Priority**: **High** or **Critical** ⚠️ (must be high or critical!)
   - **Category**: Any
4. Click **Submit**

### Step 2: Check Database (via Supabase Dashboard)
1. Go to **Supabase Dashboard** > **Table Editor**
2. Open table: **`bugs`**
3. Verify your test bug is there
4. Open table: **`bug_notifications`**
5. You should see a notification with:
   - `status`: "pending"
   - `notification_type`: "new_bug"
   - `recipient_email`: Your admin email

### Step 3: Wait for Cron (5 minutes max)
The cron job runs every 5 minutes. It will:
- Find pending notifications
- Call the Supabase Edge Function
- Send the email via Resend
- Update status to "sent"

### Step 4: Check Your Email
- Look in **inbox** for email from `onboarding@resend.dev`
- Check **spam folder** if not in inbox
- Subject should be: `[HIGH] Test Email Notification`

---

## Method 2: Check Supabase Directly

### Verify Edge Function is Deployed

```bash
# Get function URL (replace YOUR_PROJECT_REF)
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email

# Should return 401 or validation error (not 404)
# 404 means function isn't deployed
```

### Check Supabase Logs

```bash
# View Edge Function logs
supabase functions logs send-email --tail

# Or via Dashboard:
# Supabase > Edge Functions > send-email > Logs
```

---

## Method 3: Check Vercel Cron Logs

1. Go to **Vercel Dashboard**
2. Click your project
3. Go to **Deployments**
4. Click latest deployment
5. Click **Functions** tab
6. Find: `/api/cron/process-notifications`
7. Check logs - should show runs every 5 minutes

Example log output:
```
[CRON] Starting notification processing job...
[EMAIL] Processing pending bug notifications...
[EMAIL] Found 1 pending notification(s)
[EMAIL] Sending bug notification via supabase to 1 recipient(s)
[EMAIL] ✅ Sent notification abc-123
[CRON] Notification processing complete: { processed: 1, successful: 1, failed: 0 }
```

---

## Method 4: Manual Cron Trigger

Trigger the cron job manually to process any pending notifications:

```bash
curl -X POST https://cachegpt.app/api/cron/process-notifications \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Or if you didn't set CRON_SECRET, Vercel Cron header also works:
curl -X POST https://cachegpt.app/api/cron/process-notifications \
  -H "x-vercel-cron: 1"
```

Expected response:
```json
{
  "success": true,
  "processed": 1,
  "successful": 1,
  "failed": 0,
  "timestamp": "2025-09-30T..."
}
```

---

## Method 5: Check Resend Dashboard

1. Go to **https://resend.com/logs**
2. Sign in
3. View recent emails sent
4. Check delivery status

You should see:
- **From**: onboarding@resend.dev
- **To**: Your admin email
- **Subject**: [HIGH] Test Email Notification
- **Status**: Delivered ✅

---

## Troubleshooting

### No notification created in database
**Issue**: Bug submitted but no entry in `bug_notifications` table

**Causes**:
- Bug priority is not "high" or "critical"
- Database trigger not working
- Migration not run

**Fix**:
```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trigger_notify_admins_on_new_bug';

-- If missing, run migration:
-- psql -f database-scripts/030_rbac_and_notifications.sql
```

### Notification stuck in "pending" status
**Issue**: Notification created but not being sent

**Causes**:
- Cron job not running
- Edge Function not deployed
- RESEND_API_KEY not set

**Fix**:
1. Check Vercel cron logs
2. Verify function: `supabase functions list`
3. Check secret: `supabase secrets list`

### Email not arriving
**Issue**: Notification status is "sent" but email not received

**Causes**:
- Email in spam folder
- Invalid recipient email
- Resend API issue

**Fix**:
1. Check spam folder
2. Check Resend dashboard for delivery status
3. Verify email address in `user_roles` table

### Edge Function 404
**Issue**: Function not found

**Fix**:
```bash
supabase functions deploy send-email
```

### "RESEND_API_KEY not configured"
**Issue**: Secret not set in Supabase

**Fix**:
```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```

---

## Success Checklist

Use this to verify everything is working:

- [ ] Bug submitted with HIGH or CRITICAL priority
- [ ] Bug appears in `bugs` table
- [ ] Notification created in `bug_notifications` table with status="pending"
- [ ] Cron job runs (check Vercel logs)
- [ ] Notification status changed to "sent"
- [ ] Email received in inbox (or spam)
- [ ] Email shows in Resend dashboard as "Delivered"

---

## Quick Test Script

If you have access to production database:

```sql
-- 1. Check for admins
SELECT u.email, ur.role
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'admin';

-- 2. Check for pending notifications
SELECT * FROM bug_notifications
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Check recent bugs
SELECT id, title, priority, created_at
FROM bugs
ORDER BY created_at DESC
LIMIT 5;

-- 4. Check notification history
SELECT
  bn.recipient_email,
  bn.notification_type,
  bn.status,
  bn.created_at,
  bn.sent_at,
  b.title as bug_title,
  b.priority
FROM bug_notifications bn
LEFT JOIN bugs b ON b.id = bn.bug_id
ORDER BY bn.created_at DESC
LIMIT 10;
```

---

## Expected Flow

```
1. User submits HIGH priority bug
   ↓
2. Bug saved to `bugs` table
   ↓
3. Trigger creates entry in `bug_notifications` (status: pending)
   ↓
4. Cron job runs (every 5 min)
   ↓
5. Cron calls Supabase Edge Function
   ↓
6. Edge Function calls Resend API
   ↓
7. Email sent to admin
   ↓
8. Notification status updated to "sent"
   ↓
9. Admin receives email with bug details
```

---

## Need Help?

If email still isn't working after following these steps:

1. Check all logs (Vercel + Supabase + Resend)
2. Verify all secrets are set
3. Make sure database migration ran
4. Confirm Edge Function deployed
5. Test with priority set to HIGH or CRITICAL

---

**Most Common Issue**: Setting priority to "Medium" or "Low" - only HIGH and CRITICAL trigger emails!
