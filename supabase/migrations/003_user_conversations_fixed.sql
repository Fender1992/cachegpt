-- Add auth_user_id column to conversations table if it doesn't exist
ALTER TABLE claude_conversations
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- Create index for user filtering
CREATE INDEX IF NOT EXISTS idx_conversations_auth_user_id
  ON claude_conversations(auth_user_id);

-- Drop the existing view first
DROP VIEW IF EXISTS conversation_summaries;

-- Recreate the conversation summaries view with the new columns
CREATE VIEW conversation_summaries AS
SELECT
    c.id,
    c.session_id,
    c.auth_user_id,
    c.user_id as claude_user_id,
    c.project_path,
    c.git_branch,
    c.started_at,
    c.last_updated,
    COUNT(m.id) as message_count,
    COUNT(m.id) FILTER (WHERE m.role = 'user') as user_messages,
    COUNT(m.id) FILTER (WHERE m.role = 'assistant') as assistant_messages,
    SUM((m.usage->>'output_tokens')::int) as total_output_tokens,
    SUM((m.usage->>'input_tokens')::int) as total_input_tokens
FROM claude_conversations c
LEFT JOIN claude_messages m ON c.id = m.conversation_id
GROUP BY c.id;

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Allow read access to conversations" ON claude_conversations;
DROP POLICY IF EXISTS "Allow insert conversations" ON claude_conversations;
DROP POLICY IF EXISTS "Allow update conversations" ON claude_conversations;
DROP POLICY IF EXISTS "Allow read access to messages" ON claude_messages;
DROP POLICY IF EXISTS "Allow insert messages" ON claude_messages;

-- Create new RLS policies that respect user ownership
-- Users can only see their own conversations
CREATE POLICY "Users can view own conversations" ON claude_conversations
    FOR SELECT USING (
        auth_user_id = auth.uid()
        OR auth_user_id IS NULL -- Allow viewing unassigned conversations temporarily
    );

-- Users can create conversations for themselves
CREATE POLICY "Users can create own conversations" ON claude_conversations
    FOR INSERT WITH CHECK (
        auth_user_id = auth.uid()
        OR auth_user_id IS NULL -- Allow creating without auth temporarily
    );

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations" ON claude_conversations
    FOR UPDATE USING (
        auth_user_id = auth.uid()
        OR auth_user_id IS NULL
    );

-- Users can view messages from their own conversations
CREATE POLICY "Users can view messages from own conversations" ON claude_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM claude_conversations c
            WHERE c.id = claude_messages.conversation_id
            AND (c.auth_user_id = auth.uid() OR c.auth_user_id IS NULL)
        )
    );

-- Users can add messages to their own conversations
CREATE POLICY "Users can add messages to own conversations" ON claude_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM claude_conversations c
            WHERE c.id = claude_messages.conversation_id
            AND (c.auth_user_id = auth.uid() OR c.auth_user_id IS NULL)
        )
    );

-- Function to claim unassigned conversations by Claude user ID
CREATE OR REPLACE FUNCTION claim_conversations_by_claude_user(claude_uid TEXT)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE claude_conversations
    SET auth_user_id = auth.uid()
    WHERE user_id = claude_uid
    AND auth_user_id IS NULL
    AND auth.uid() IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;