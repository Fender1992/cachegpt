-- Add missing fields to usage table for chat history storage
ALTER TABLE usage
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS response TEXT,
ADD COLUMN IF NOT EXISTS provider VARCHAR(100);

-- Create index for searching chat history
CREATE INDEX IF NOT EXISTS idx_usage_prompt_response ON usage USING gin(to_tsvector('english', coalesce(prompt, '') || ' ' || coalesce(response, '')));

-- Update RLS policies to allow users to see their own usage
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view own usage" ON usage;
DROP POLICY IF EXISTS "Users can insert own usage" ON usage;

-- Create policies
CREATE POLICY "Users can view own usage" ON usage
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own usage" ON usage
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow anonymous inserts for non-authenticated users
CREATE POLICY "Allow anonymous usage tracking" ON usage
  FOR INSERT WITH CHECK (user_id IS NULL);