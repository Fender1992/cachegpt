# URGENT: Fix for "Database error saving new user"

## Problem
Users cannot sign up - getting "Database error saving new user" error.

## Root Cause
The database trigger that creates user profiles after signup doesn't have the necessary privileges to bypass Row Level Security (RLS).

## Solution
Apply the new migration `018_fix_signup_trigger_definer.sql` which:
1. Recreates the trigger function with `SECURITY DEFINER` privilege
2. Ensures the function can bypass RLS to create user profiles
3. Adds proper error logging for debugging

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (RECOMMENDED)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (zfqtydaskvtevhdsltbp)
3. Click **SQL Editor** in the left sidebar
4. **IMPORTANT**: Copy and paste ALL contents of `018_fix_signup_trigger_definer.sql`
5. Click **Run**
6. You should see:
   - "Success. No rows returned" or
   - A result showing the function and trigger were created

### Option 2: Direct SQL Query

If the above doesn't work, try this minimal fix:

```sql
-- Quick fix: Recreate function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id, email, provider, email_verified, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    false, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;
```

## Verification

After applying the fix, test signup:

```bash
cachegpt login
# Choose "No, create a new account"
# Enter email and password
# Should see "Account created!" message
```

## If It Still Doesn't Work

1. **Check Supabase Logs**:
   - Go to Dashboard → Logs → Postgres Logs
   - Look for errors containing "handle_new_user"

2. **Verify the Function**:
   Run this query in SQL Editor:
   ```sql
   SELECT prosecdef FROM pg_proc WHERE proname = 'handle_new_user';
   ```
   Should return `true` (meaning SECURITY DEFINER is enabled)

3. **Check Auth Settings**:
   - Dashboard → Authentication → Providers
   - Ensure Email provider is enabled
   - Check "Confirm email" is disabled for testing

4. **Alternative Approach**:
   If the trigger approach fails, disable RLS temporarily:
   ```sql
   ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
   ```
   ⚠️ Only do this for testing - re-enable with:
   ```sql
   ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
   ```

## Contact Support

If the issue persists after trying these fixes:
- Email: support@cachegpt.io
- Include the error message and what you've tried