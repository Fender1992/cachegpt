# Fix User Signup Issue - Database Migration

## Quick Fix Instructions

The "Database error saving new user" issue is caused by missing Row Level Security (RLS) policies on the `user_profiles` table.

### Option 1: Apply via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project (zfqtydaskvtevhdsltbp)
3. Click on **SQL Editor** in the left sidebar
4. Copy and paste the contents of `017_fix_user_profiles_rls.sql`
5. Click **Run** button
6. You should see "Success. No rows returned" message

### Option 2: Apply via Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref zfqtydaskvtevhdsltbp

# Apply the migration
supabase db push --file database-scripts/017_fix_user_profiles_rls.sql
```

### What This Migration Does

1. **Enables RLS** on `user_profiles` table
2. **Adds INSERT policy** - Allows users to create their own profile during signup
3. **Adds SELECT policy** - Users can view their own profile
4. **Adds UPDATE policy** - Users can update their own profile
5. **Adds service role bypass** - For triggers and admin operations
6. **Fixes trigger function** - Adds error handling to prevent signup failures
7. **Recreates trigger** - Ensures it's properly attached

### Verification

After applying the migration, test signup with:

```bash
cachegpt signup --console
```

You should be able to create a new account without the "Database error" message.

### Troubleshooting

If you still see errors after applying the migration:

1. Check RLS is enabled:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'user_profiles';
```

2. Check policies exist:
```sql
SELECT polname FROM pg_policies
WHERE tablename = 'user_profiles';
```

Should show:
- Users can view their own profile
- Users can update their own profile
- Users can insert their own profile
- Service role can manage all profiles

3. If policies are missing, re-run the migration.