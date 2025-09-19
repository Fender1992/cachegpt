# Supabase Setup Guide

To fix the "Database error saving new user" issue, follow these steps:

## 1. Run Database Migrations

Go to your Supabase dashboard and run these SQL scripts in the SQL Editor:

### Step 1: Set up Auth Profiles
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/001_setup_auth_profiles.sql
```

### Step 2: Set up Claude Conversations
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/002_claude_conversations_simple.sql
-- (Use this version to avoid view column conflicts)
```

### Step 3: Set up User Conversations
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/003_user_conversations_fixed.sql
```

## 2. Configure Authentication Settings

1. Go to **Authentication > Settings** in your Supabase dashboard
2. Ensure these settings:
   - ✅ **Enable email signups**: ON
   - ✅ **Enable email confirmations**: OFF (for testing) or ON (for production)
   - ✅ **Secure email change**: ON
   - ✅ **Double confirm email changes**: OFF (for testing)

## 3. Configure Email Templates (Optional)

If you want custom email templates:
1. Go to **Authentication > Email Templates**
2. Customize the signup confirmation email
3. Set your redirect URL to: `http://localhost:3000/auth/callback`

## 4. Test Authentication

After running the migrations, test with:

```bash
# Test registration
llm-cache register

# Test login
llm-cache login

# Check status
llm-cache auth-status
```

## 5. Common Issues & Solutions

### Issue: "Database error saving new user"
**Solution**: Run the `001_setup_auth_profiles.sql` migration to create the profiles table and trigger.

### Issue: "Email not confirmed"
**Solution**: Either:
- Disable email confirmations in Auth settings (for testing)
- Check your email and click the confirmation link

### Issue: "Invalid login credentials"
**Solution**: Ensure the user was created successfully and email is confirmed (if required).

### Issue: RLS policy errors
**Solution**: The migrations include proper RLS policies. If issues persist, check that the policies are applied correctly.

## 6. Verify Setup

Run this query in Supabase SQL Editor to verify setup:

```sql
-- Check if profiles table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'profiles';

-- Check if trigger exists
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Check if conversation tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('claude_conversations', 'claude_messages');
```

## 7. Environment Variables

Ensure your `.env.local` contains:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```