# FINAL FIX for "Database error saving new user"

## The Problem
The trigger that creates user profiles after signup is failing, even with SECURITY DEFINER. This is likely due to Supabase's security restrictions.

## Solution Options

### Option 1: Run Complete Diagnostic & Fix (RECOMMENDED)
This script diagnoses the issue and applies a comprehensive fix.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **SQL Editor**
4. Copy ALL contents of `019_diagnose_and_fix_signup.sql`
5. Click **Run**
6. Check the output - it will show diagnostic information
7. Test signup again

### Option 2: Alternative Approach (IF OPTION 1 FAILS)
This completely disables RLS temporarily to ensure signups work.

1. In SQL Editor, run `020_alternative_signup_fix.sql`
2. This will:
   - Disable RLS on user_profiles table
   - Create a simpler trigger
   - Grant all permissions needed
3. Test signup again

### Option 3: Manual Quick Fix (EMERGENCY)
If both scripts fail, run this single command to disable security:

```sql
-- EMERGENCY: Disable all security on user_profiles
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_profiles TO anon;
GRANT ALL ON public.user_profiles TO authenticated;
```

Then test signup. Once working, you can re-enable security later.

## How to Test

After applying any fix:

```bash
cachegpt login
# Choose "No, create a new account"
# Enter email and password
# Should see "Account created!" instead of error
```

## What Each Fix Does

**Option 1 (Diagnostic)**:
- Shows current table structure
- Lists all RLS policies
- Recreates trigger with better error handling
- Uses permissive INSERT policy

**Option 2 (Alternative)**:
- Disables RLS completely (temporary)
- Simplifies trigger to bare minimum
- Grants full permissions

**Option 3 (Emergency)**:
- Just removes all security blocks
- Gets signup working immediately
- Can add security back later

## Still Not Working?

If none of these work, the issue might be:

1. **Supabase Dashboard Settings**:
   - Go to Authentication → Settings
   - Ensure "Enable email confirmations" is OFF for testing
   - Check "Enable new user signups" is ON

2. **Database Connection**:
   - The CLI might be connecting to wrong project
   - Check the Supabase URL in error messages

3. **Contact Support**:
   - Email: support@cachegpt.io
   - Include: "Tried migrations 019 and 020, still getting signup error"

## Important Note

Once signup is working with Option 2 or 3, you should later re-enable security:

```sql
-- Re-enable security after fixing core issue
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Add back proper policies
CREATE POLICY "Users can manage own profile" ON user_profiles
    USING (auth.uid() = id OR id IS NULL)
    WITH CHECK (auth.uid() = id OR id IS NULL);
```