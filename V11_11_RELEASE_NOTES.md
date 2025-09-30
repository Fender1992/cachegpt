# CacheGPT v11.11.0 Release Notes
**Release Date**: September 30, 2025
**Type**: Major Feature Release - RBAC & Notifications

---

## 🎯 Overview

Version 11.11.0 addresses the high-priority improvements identified in the bug submission validation report. This release introduces enterprise-grade role-based access control, automated email notifications, and screenshot upload capabilities.

---

## ✨ New Features

### 1. Role-Based Access Control (RBAC)
**Replaces hardcoded admin email with flexible role system**

#### New Database Tables:
- **`user_roles`**: Store user role assignments
  - Roles: `admin`, `moderator`, `support`, `user`
  - Optional expiry dates for temporary roles
  - Tracks who granted roles and when

- **`bug_audit_log`**: Track all bug changes
  - Records create, update, delete operations
  - Stores old and new values
  - Links to user who made the change

- **`bug_notifications`**: Email notification queue
  - Stores pending/sent/failed status
  - Retry counter (max 3 attempts)
  - Error tracking

#### Helper Functions:
```sql
-- Check if user has role
SELECT has_role('user-uuid', 'admin');

-- Check current user's role
SELECT current_user_has_role('admin');

-- Grant role (admin only)
SELECT grant_user_role('user-uuid', 'moderator', NULL);

-- Revoke role (admin only)
SELECT revoke_user_role('user-uuid', 'moderator');

-- Get all user roles
SELECT * FROM get_user_roles('user-uuid');
```

#### Admin Auth Changes:
- `/lib/admin-auth.ts` now checks `user_roles` table first
- Legacy fallback to hardcoded email for backwards compatibility
- Returns full roles array in session
- Logs warning when using legacy check

---

### 2. Email Notification System
**Automated alerts for high/critical priority bugs**

#### Supported Providers:
- **SendGrid** - Full-featured email service
- **Resend** - Modern developer-friendly email
- **Postmark** - Transactional email specialist
- **Console** - Development mode (logs to console)

#### Features:
- Beautiful HTML email templates with priority colors
- Plain text fallback
- Automatic triggering for high/critical bugs
- Retry logic (up to 3 attempts)
- Cron job processing (`/api/cron/process-notifications`)
- Notification queue in database

#### Email Template:
- Gradient header with bug icon
- Priority badge (color-coded)
- Bug details (title, description, category)
- Reported by, URL, timestamp
- "View in Bug Tracker" button
- Professional footer

#### Setup:
1. Configure environment variable for chosen provider:
   ```bash
   SENDGRID_API_KEY=your_key  # OR
   RESEND_API_KEY=your_key    # OR
   POSTMARK_API_KEY=your_key

   EMAIL_FROM=notifications@cachegpt.app
   CRON_SECRET=your_secret_key
   ```

2. Set up cron job to call `/api/cron/process-notifications` every 5 minutes

3. Admins with role in `user_roles` table will receive notifications

---

### 3. Screenshot Upload
**Users can attach images to bug reports**

#### Features:
- Drag-and-drop or click to upload
- Image preview before submission
- Validation:
  - Image files only
  - Max 5MB file size
- Uploads to Supabase Storage
- Graceful fallback if upload fails
- Remove/replace screenshots

#### Implementation:
- Component: `/components/bug-report-button.tsx`
- Storage: Supabase `bug-attachments` bucket
- Path: `bug-screenshots/{timestamp}-{random}.{ext}`
- Public read access for admins

#### Setup:
1. Create Supabase Storage bucket: `bug-attachments`
2. Set bucket to public read
3. Add upload policy for authenticated users

---

## 🔧 Technical Changes

### Database Migration
**File**: `/database-scripts/030_rbac_and_notifications.sql`

#### Includes:
- Create `user_roles` table with RLS policies
- Create `bug_notifications` table
- Create `bug_audit_log` table
- Update `bugs` table RLS policies
- Add helper functions for role management
- Create triggers for notifications and audit logging
- Migrate existing admin to user_roles

#### Migration is idempotent - safe to run multiple times

---

### API Changes

#### New Endpoint:
**POST/GET** `/api/cron/process-notifications`
- Processes pending email notifications
- Requires `Authorization: Bearer {CRON_SECRET}` OR `x-vercel-cron: 1` header
- Returns stats: `{ processed, successful, failed }`
- Should run every 5 minutes

#### Modified Endpoints:
- `/api/bugs/report` - Now accepts `screenshotUrl` parameter
- All admin endpoints use RBAC instead of hardcoded email

---

### Library Changes

#### New Library:
**`/lib/email-notifications.ts`**
- `sendBugNotificationEmail()` - Send single notification
- `processPendingNotifications()` - Process queue
- Multi-provider support with automatic detection
- HTML and text email generation

#### Modified Library:
**`/lib/admin-auth.ts`**
- `verifyAdminAuth()` - Now checks user_roles table
- Returns roles array in session
- Legacy fallback maintained
- Migration warnings

---

## 📋 Migration Guide

### For Existing Installations:

1. **Run Database Migration**:
   ```bash
   psql -h your-db-host -U your-user -d your-db -f database-scripts/030_rbac_and_notifications.sql
   ```

2. **Verify Admin Migration**:
   ```sql
   SELECT * FROM user_roles WHERE role = 'admin';
   ```
   Should show existing admin with role

3. **Create Storage Bucket**:
   - Go to Supabase Dashboard > Storage
   - Create bucket: `bug-attachments`
   - Set to public read
   - Add upload policy for authenticated users

4. **Configure Email Provider** (Choose one):
   ```bash
   # SendGrid
   export SENDGRID_API_KEY=your_key

   # OR Resend
   export RESEND_API_KEY=your_key

   # OR Postmark
   export POSTMARK_API_KEY=your_key

   # Common
   export EMAIL_FROM=notifications@cachegpt.app
   export CRON_SECRET=$(openssl rand -hex 32)
   ```

5. **Set Up Cron Job**:

   **Option A: Vercel Cron** (add to `vercel.json`):
   ```json
   {
     "crons": [{
       "path": "/api/cron/process-notifications",
       "schedule": "*/5 * * * *"
     }]
   }
   ```

   **Option B: External Cron**:
   ```bash
   */5 * * * * curl -X POST https://cachegpt.app/api/cron/process-notifications \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

6. **Grant Additional Admin Roles** (if needed):
   ```sql
   SELECT grant_user_role(
     'user-uuid-here',
     'admin',
     NULL  -- No expiry
   );
   ```

---

## 🧪 Testing

### Test RBAC System:
```bash
# 1. Check current roles
SELECT * FROM user_roles;

# 2. Test granting role
SELECT grant_user_role('test-user-id', 'moderator', NULL);

# 3. Test checking role
SELECT has_role('test-user-id', 'moderator');

# 4. Test revoking role
SELECT revoke_user_role('test-user-id', 'moderator');
```

### Test Email Notifications:
```bash
# 1. Submit high priority bug via UI

# 2. Check notification created
SELECT * FROM bug_notifications WHERE status = 'pending';

# 3. Manually trigger cron job
curl -X POST http://localhost:3000/api/cron/process-notifications \
  -H "Authorization: Bearer your-cron-secret"

# 4. Check console output (if in dev mode) or email inbox
```

### Test Screenshot Upload:
1. Open bug report modal
2. Click "Upload Image"
3. Select image file (< 5MB)
4. Verify preview appears
5. Submit bug report
6. Check Supabase Storage for uploaded file
7. Verify bug report has screenshot_url

---

## 📊 Performance Impact

- **Database**: 3 new tables with minimal overhead
- **Storage**: Screenshots stored in Supabase (user-controlled)
- **Email**: Async queue processing, no impact on bug submission
- **Auth**: Single additional query for role check (cached in session)

---

## 🔒 Security Considerations

### RBAC:
- RLS policies enforce role-based access
- Only admins can grant/revoke roles
- Role expiry support for temporary access
- Audit trail of all role changes

### Email:
- API keys stored in environment (not database)
- Cron endpoint requires authentication
- Rate limiting via cron schedule
- No sensitive data in email content

### Screenshots:
- File type validation (images only)
- Size limit (5MB max)
- Unique filenames prevent collisions
- Public read only (no overwrites)

---

## 🐛 Known Issues

None identified in v11.11.0

---

## 📚 Documentation

- **STATUS File**: `/STATUS_2025_09_24.md` - Updated with full details
- **Validation Report**: `/BUG_SUBMISSION_VALIDATION.md` - Assessment results
- **App Status Report**: `/APP_STATUS_REPORT.md` - Complete system review
- **Migration Script**: `/database-scripts/030_rbac_and_notifications.sql` - Well-documented

---

## 🎉 Credits

**Implemented**: September 30, 2025
**Version**: 11.11.0
**Developer**: Claude (AI Assistant)
**Reviewed**: Comprehensive validation completed

---

## 📞 Support

For issues or questions:
1. Check `/STATUS_2025_09_24.md` for current state
2. Review `/BUG_SUBMISSION_VALIDATION.md` for testing results
3. Submit bug report via UI with screenshot
4. Admins will be notified automatically

---

## 🚀 Next Steps

Recommended future enhancements:
1. Add bug search functionality
2. Implement duplicate detection
3. Add user bug history page
4. Create bug report templates
5. Add mobile app screenshot capture
6. Implement bug voting system
7. Add slack/discord notification integrations

---

## ✅ Upgrade Checklist

- [ ] Run database migration script
- [ ] Verify admin role in user_roles table
- [ ] Create bug-attachments storage bucket
- [ ] Configure email provider environment variables
- [ ] Set up cron job for notifications
- [ ] Test screenshot upload
- [ ] Submit test bug (high priority)
- [ ] Verify email notification received
- [ ] Check audit log for bug changes
- [ ] Grant additional admin roles if needed
- [ ] Update production environment variables
- [ ] Deploy to production
- [ ] Monitor logs for migration warnings

---

**Happy Bug Tracking! 🐛✨**
