-- Disable enterprise mode - use free providers unless user adds API keys
UPDATE user_profiles
SET enterprise_mode = false
WHERE email = 'rolandofender@gmail.com';

-- Verify
SELECT email, enterprise_mode, selected_provider
FROM user_profiles
WHERE email = 'rolandofender@gmail.com';
