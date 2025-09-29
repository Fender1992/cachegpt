-- =====================================================
-- FIX USER_PROFILES RLS POLICIES
-- Fixes the "Database error saving new user" issue
-- =====================================================

-- Enable RLS on user_profiles if not already enabled
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON user_profiles;

-- Create comprehensive RLS policies

-- 1. Users can view their own profile
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 2. Users can update their own profile
CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- 3. Users can insert their own profile (critical for signup)
CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 4. Service role bypass for triggers and admin operations
CREATE POLICY "Service role can manage all profiles" ON user_profiles
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Fix the handle_new_user function to handle conflicts properly
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into user_profiles with proper conflict handling
  INSERT INTO user_profiles (
    id,
    email,
    provider,
    email_verified,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    email_verified = EXCLUDED.email_verified,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it's properly attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Also ensure user_provider_credentials has proper RLS
ALTER TABLE user_provider_credentials ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for user_provider_credentials
DROP POLICY IF EXISTS "Users can manage their own credentials" ON user_provider_credentials;
DROP POLICY IF EXISTS "Service role bypass" ON user_provider_credentials;

CREATE POLICY "Users can manage their own credentials" ON user_provider_credentials
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role bypass" ON user_provider_credentials
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Verify the tables have RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('user_profiles', 'user_provider_credentials');

-- Add comment
COMMENT ON FUNCTION handle_new_user() IS 'Creates user profile after signup with proper error handling';