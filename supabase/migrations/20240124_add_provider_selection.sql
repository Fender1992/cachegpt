-- Add provider selection fields to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS selected_provider TEXT,
ADD COLUMN IF NOT EXISTS selected_model TEXT,
ADD COLUMN IF NOT EXISTS enterprise_mode BOOLEAN DEFAULT FALSE;

-- Create index for faster provider queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_selected_provider
ON user_profiles(selected_provider);

-- Add check constraint for valid providers
ALTER TABLE user_profiles
ADD CONSTRAINT check_valid_provider
CHECK (selected_provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', NULL));

-- Comment on columns
COMMENT ON COLUMN user_profiles.selected_provider IS 'User selected LLM provider';
COMMENT ON COLUMN user_profiles.selected_model IS 'Specific model for the selected provider';
COMMENT ON COLUMN user_profiles.enterprise_mode IS 'Whether user is in enterprise mode (can use own API keys)';