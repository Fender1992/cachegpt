-- Create table for storing Claude web sessions
CREATE TABLE IF NOT EXISTS public.user_claude_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_key TEXT NOT NULL,
  organization_id TEXT,
  conversation_id TEXT,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_claude_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own Claude sessions
CREATE POLICY "Users can view own Claude sessions" ON public.user_claude_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own Claude sessions
CREATE POLICY "Users can update own Claude sessions" ON public.user_claude_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can insert their own Claude sessions
CREATE POLICY "Users can insert own Claude sessions" ON public.user_claude_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own Claude sessions
CREATE POLICY "Users can delete own Claude sessions" ON public.user_claude_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER handle_user_claude_sessions_updated_at
  BEFORE UPDATE ON public.user_claude_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Index for faster lookups
CREATE INDEX idx_user_claude_sessions_user_id ON public.user_claude_sessions(user_id);
CREATE INDEX idx_user_claude_sessions_last_used ON public.user_claude_sessions(last_used_at DESC);