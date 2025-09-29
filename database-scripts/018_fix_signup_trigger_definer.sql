-- =====================================================
-- FIX SIGNUP TRIGGER WITH SECURITY DEFINER
-- Ensures the trigger can bypass RLS to create profiles
-- =====================================================

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Create the function with SECURITY DEFINER
-- This allows the function to run with the privileges of the function owner (superuser)
-- bypassing RLS policies
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert into user_profiles with proper conflict handling
  INSERT INTO public.user_profiles (
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
    -- Log error details for debugging
    RAISE LOG 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    -- Still return NEW to not block the signup
    RETURN NEW;
END;
$$;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add RLS policies if they don't exist
DO $$
BEGIN
  -- Drop existing policies to recreate them
  DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Service role can manage all profiles" ON user_profiles;

  -- Create policies
  CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT
    USING (auth.uid() = id);

  CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE
    USING (auth.uid() = id);

  CREATE POLICY "Users can insert their own profile" ON user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

  -- This policy allows the trigger to work
  CREATE POLICY "Service role can manage all profiles" ON user_profiles
    FOR ALL
    USING (
      auth.jwt() ->> 'role' = 'service_role' OR
      current_setting('request.jwt.claim.sub', true) IS NULL
    );
END $$;

-- Verify the function has the correct security settings
SELECT
  proname,
  prosecdef as is_security_definer
FROM pg_proc
WHERE proname = 'handle_new_user';

-- Test that the trigger exists
SELECT
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates user profile after signup with SECURITY DEFINER to bypass RLS';