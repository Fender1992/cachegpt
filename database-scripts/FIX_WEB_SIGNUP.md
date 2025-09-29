# Fix Web App Signup Error (500 Internal Server Error)

## Problem
The web app (https://cachegpt.app) is getting a 500 error when users try to sign up. This is the same database trigger issue affecting the CLI, but on a different Supabase project.

## Projects Affected

1. **CLI Project**: `zfqtydaskvtevhdsltbp` (already has migrations)
2. **Web Project**: `slxgfzlralwbpzafbufm` (needs the fix)

## Apply the Fix to Web Project

### Step 1: Go to the Web Project's Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select the project: **slxgfzlralwbpzafbufm** (this is the web app's project)
3. Click **SQL Editor** in the left sidebar

### Step 2: Apply the Migration

Copy and paste the entire contents of `025_fix_trigger_conflicts.sql` into the SQL Editor and click **Run**.

This migration will:
- Disable RLS temporarily on user_profiles
- Fix the trigger function
- Create fallback methods
- Grant necessary permissions

### Step 3: Verify the Fix

After running the migration, you should see:
```
✅ MULTIPLE FIXES APPLIED:
1. RLS disabled (temporary)
2. Trigger recreated with "a_" prefix for priority
3. Fallback function force_create_user_profile() created
4. RPC endpoint complete_signup() available
```

### Step 4: Test Web Signup

Go to https://cachegpt.app and try creating a new account. It should work now.

## If It Still Fails

Check these settings in the **slxgfzlralwbpzafbufm** project:

1. **Authentication → Settings**:
   - "Enable new user signups" = ON
   - "Confirm email" = OFF (for testing)

2. **Authentication → Providers → Email**:
   - Should be enabled (green toggle)

3. **Authentication → Logs**:
   - Check for any errors after attempting signup

## Important Notes

- The CLI and web app use **different Supabase projects**
- The CLI fixes only apply to the CLI's project (`zfqtydaskvtevhdsltbp`)
- The web app needs the same fixes applied to its project (`slxgfzlralwbpzafbufm`)
- Both projects need the same database structure and triggers

## Quick Emergency Fix

If you need signup working immediately, run this in the SQL Editor for the **slxgfzlralwbpzafbufm** project:

```sql
-- Emergency: Disable all security on user_profiles
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_profiles TO anon;
GRANT ALL ON public.user_profiles TO authenticated;
```

This removes all barriers and should allow signups to work immediately.