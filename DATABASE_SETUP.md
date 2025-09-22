# Database Setup for Chat History

## Problem
Chat conversations from the CLI are not being saved to the database because:
1. The `usage` table is missing required fields (`prompt`, `response`, `provider`)
2. Environment variables may not be configured properly

## Solution

### 1. Apply the Database Migration

Run this SQL in your Supabase SQL editor:

```sql
-- Add missing fields to usage table for chat history storage
ALTER TABLE usage
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS response TEXT,
ADD COLUMN IF NOT EXISTS provider VARCHAR(100);

-- Create index for searching chat history
CREATE INDEX IF NOT EXISTS idx_usage_prompt_response ON usage
USING gin(to_tsvector('english', coalesce(prompt, '') || ' ' || coalesce(response, '')));

-- Update RLS policies to allow users to see their own usage
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own usage" ON usage;
DROP POLICY IF EXISTS "Users can insert own usage" ON usage;
DROP POLICY IF EXISTS "Allow anonymous usage tracking" ON usage;

-- Create policies
CREATE POLICY "Users can view own usage" ON usage
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own usage" ON usage
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow anonymous inserts for non-authenticated users
CREATE POLICY "Allow anonymous usage tracking" ON usage
  FOR INSERT WITH CHECK (user_id IS NULL);
```

### 2. Set Environment Variables

Add these to your `.env.local` file in the main project directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Or export them in your shell:

```bash
export NEXT_PUBLIC_SUPABASE_URL="your_supabase_project_url"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
```

### 3. Verify Setup

After applying the migration and setting environment variables:

1. Run the CLI: `cachegpt chat`
2. Have a conversation
3. Check your Supabase dashboard - you should see entries in the `usage` table with:
   - `prompt` - The user's message
   - `response` - The AI's response
   - `model` - The model used
   - `provider` - The provider (e.g., "openai")
   - `cache_hit` - Whether it was cached
   - `user_id` - Your user ID (if authenticated)

### 4. Viewing Chat History

You can view your chat history in the web UI at `/conversations` or by querying the database:

```sql
SELECT prompt, response, created_at, cache_hit
FROM usage
WHERE user_id = 'your-user-id'
  AND prompt IS NOT NULL
ORDER BY created_at DESC;
```

## Notes

- Chats are saved both locally (in `~/.cachegpt/cache/cache.json`) and in the cloud (if configured)
- Anonymous chats (not logged in) are saved with `user_id = NULL`
- Authenticated users can see both their own chats and anonymous chats
- The system automatically falls back to local storage if database save fails