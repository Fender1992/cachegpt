-- Enable enterprise mode for user
-- Usage: Run this via Supabase SQL Editor

-- 1. Check current status
SELECT id, email, enterprise_mode, selected_provider
FROM user_profiles
WHERE email = 'rolandofender@gmail.com';

-- 2. Enable enterprise mode
UPDATE user_profiles
SET enterprise_mode = true
WHERE email = 'rolandofender@gmail.com';

-- 3. Verify it worked
SELECT id, email, enterprise_mode, selected_provider
FROM user_profiles
WHERE email = 'rolandofender@gmail.com';

-- 4. Check existing API keys
SELECT user_id, provider,
       CASE WHEN api_key IS NOT NULL THEN 'Set' ELSE 'Not Set' END as key_status
FROM user_provider_credentials
WHERE user_id = (SELECT id FROM user_profiles WHERE email = 'rolandofender@gmail.com');
