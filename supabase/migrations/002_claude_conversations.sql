-- Create conversations table
CREATE TABLE IF NOT EXISTS claude_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    user_id TEXT,
    project_path TEXT,
    git_branch TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS claude_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES claude_conversations(id) ON DELETE CASCADE,
    message_id TEXT,
    parent_uuid TEXT,
    uuid TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content JSONB,
    model TEXT,
    timestamp TIMESTAMP WITH TIME ZONE,
    request_id TEXT,
    usage JSONB,
    tool_use_result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON claude_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON claude_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_path ON claude_conversations(project_path);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON claude_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON claude_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_role ON claude_messages(role);

-- Create a view for conversation summaries
CREATE OR REPLACE VIEW conversation_summaries AS
SELECT
    c.id,
    c.session_id,
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

-- Function to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE claude_conversations
    SET last_updated = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update conversation timestamp when new message is added
CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON claude_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- Add RLS policies
ALTER TABLE claude_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_messages ENABLE ROW LEVEL SECURITY;

-- Allow users to read all conversations for now (you can restrict this later)
CREATE POLICY "Allow read access to conversations" ON claude_conversations
    FOR SELECT USING (true);

CREATE POLICY "Allow insert conversations" ON claude_conversations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update conversations" ON claude_conversations
    FOR UPDATE USING (true);

CREATE POLICY "Allow read access to messages" ON claude_messages
    FOR SELECT USING (true);

CREATE POLICY "Allow insert messages" ON claude_messages
    FOR INSERT WITH CHECK (true);