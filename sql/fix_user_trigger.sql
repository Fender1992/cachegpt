-- =====================================================
-- FIX USER PROFILE CREATION TRIGGER
-- =====================================================

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_provider TEXT;
BEGIN
  -- Extract provider from app_metadata or default to 'email'
  user_provider := COALESCE(
    NEW.app_metadata->>'provider',
    NEW.raw_app_meta_data->>'provider',
    'email'
  );

  -- Insert user profile
  INSERT INTO user_profiles (
    id,
    email,
    provider,
    email_verified,
    full_name
  )
  VALUES (
    NEW.id,
    NEW.email,
    user_provider,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    COALESCE(
      NEW.user_metadata->>'full_name',
      NEW.user_metadata->>'name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    email_verified = COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    last_login_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Also create a trigger for updates (when email is confirmed)
CREATE OR REPLACE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_new_user();