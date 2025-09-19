-- =====================================================
-- SIMPLE USER PROFILE CREATION TRIGGER
-- Only uses columns that definitely exist in auth.users
-- =====================================================

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create simple function that only uses basic fields
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Simple insert with just the basic required fields
  INSERT INTO user_profiles (
    id,
    email,
    provider,
    email_verified
  )
  VALUES (
    NEW.id,
    NEW.email,
    'email', -- Default to email, will be updated by OAuth if needed
    false    -- Default to false, will be updated when confirmed
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Test the function works
SELECT 'User trigger created successfully' as status;