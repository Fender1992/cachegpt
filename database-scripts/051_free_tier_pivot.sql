-- Migration: Free Tier Pivot
-- Make CacheGPT free for all users with 15,000 requests/month (500/day)
-- Date: 2025-09-25

BEGIN;

-- Update all existing users to the new free limit
UPDATE user_profiles SET monthly_request_limit = 15000;

-- Set the default for new users
ALTER TABLE user_profiles ALTER COLUMN monthly_request_limit SET DEFAULT 15000;

-- Replace the check_usage_limit function to allow 15,000 requests/month for ALL users
CREATE OR REPLACE FUNCTION check_usage_limit(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INT;
  user_limit INT;
BEGIN
  -- Get the user's monthly request limit (default 15000 for everyone)
  SELECT COALESCE(monthly_request_limit, 15000)
  INTO user_limit
  FROM user_profiles
  WHERE id = user_id_param;

  -- If no profile found, allow with default limit
  IF user_limit IS NULL THEN
    user_limit := 15000;
  END IF;

  -- Count requests this month
  SELECT COUNT(*)
  INTO current_usage
  FROM cached_responses
  WHERE user_id = user_id_param
    AND created_at >= date_trunc('month', NOW());

  -- Allow if under limit
  RETURN current_usage < user_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
