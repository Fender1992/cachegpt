-- Fix RLS policies for user_profiles table
-- This ensures users can create their own profiles during signup

-- First, drop existing policies
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Enable RLS if not already enabled
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create new policies with proper permissions
-- Allow users to insert their own profile (using auth.uid() which comes from the JWT)
CREATE POLICY "Enable insert for users based on user_id" ON user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to view their own profile
CREATE POLICY "Enable select for users based on user_id" ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Enable update for users based on user_id" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Grant necessary permissions
GRANT ALL ON user_profiles TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Also ensure service role has access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Verify the table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles';