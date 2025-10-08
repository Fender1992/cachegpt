-- Migration 034: Casual UI Infrastructure
-- Feature flags, telemetry, modes, and achievements tables
-- Created: October 6, 2025

-- ============================================================================
-- FEATURE FLAGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key, user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(key) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_feature_flags_user ON public.feature_flags(user_id) WHERE enabled = true;

-- RLS policies
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Admin can see all flags
CREATE POLICY "Admin can view all flags" ON public.feature_flags
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

-- Admin can manage flags
CREATE POLICY "Admin can manage flags" ON public.feature_flags
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

-- Users can see their own overrides
CREATE POLICY "Users can view own flags" ON public.feature_flags
  FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.feature_flags IS 'Feature flag configuration with user-level overrides';

-- ============================================================================
-- TELEMETRY EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  platform TEXT DEFAULT 'web',
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON public.telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_user ON public.telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_session ON public.telemetry_events(session_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_created ON public.telemetry_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_created ON public.telemetry_events(event_type, created_at DESC);

-- RLS policies
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (for anonymous tracking)
CREATE POLICY "Anyone can insert telemetry" ON public.telemetry_events
  FOR INSERT
  WITH CHECK (true);

-- Users can see their own events
CREATE POLICY "Users can view own events" ON public.telemetry_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Admin can see all events
CREATE POLICY "Admin can view all telemetry" ON public.telemetry_events
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

COMMENT ON TABLE public.telemetry_events IS 'User interaction telemetry events for analytics';

-- ============================================================================
-- TELEMETRY DAILY AGGREGATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telemetry_daily_agg (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, event_type, user_id)
);

-- Index for fast aggregation queries
CREATE INDEX IF NOT EXISTS idx_telemetry_agg_date ON public.telemetry_daily_agg(date DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_agg_type ON public.telemetry_daily_agg(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_agg_date_type ON public.telemetry_daily_agg(date, event_type);

-- RLS policies
ALTER TABLE public.telemetry_daily_agg ENABLE ROW LEVEL SECURITY;

-- Service role can manage aggregations
CREATE POLICY "Service can manage aggregations" ON public.telemetry_daily_agg
  FOR ALL
  USING (true);

-- Admin can view aggregations
CREATE POLICY "Admin can view aggregations" ON public.telemetry_daily_agg
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

COMMENT ON TABLE public.telemetry_daily_agg IS 'Daily aggregated telemetry metrics for performance';

-- ============================================================================
-- PUBLIC MODES TABLE (Templates/Use Cases)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.public_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,
  system_prompt TEXT NOT NULL,
  example_prompts TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active modes
CREATE INDEX IF NOT EXISTS idx_public_modes_active ON public.public_modes(is_active, sort_order);

-- RLS policies (public read)
ALTER TABLE public.public_modes ENABLE ROW LEVEL SECURITY;

-- Everyone can read active modes
CREATE POLICY "Anyone can view active modes" ON public.public_modes
  FOR SELECT
  USING (is_active = true);

-- Admin can manage modes
CREATE POLICY "Admin can manage modes" ON public.public_modes
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

COMMENT ON TABLE public.public_modes IS 'Pre-configured AI modes/templates for casual users';

-- ============================================================================
-- USER ACHIEVEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY(user_id, key)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_awarded ON public.user_achievements(awarded_at DESC);

-- RLS policies
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Users can see their own achievements
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role can award achievements
CREATE POLICY "Service can award achievements" ON public.user_achievements
  FOR INSERT
  WITH CHECK (true);

-- Admin can see all achievements
CREATE POLICY "Admin can view all achievements" ON public.user_achievements
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

COMMENT ON TABLE public.user_achievements IS 'Gamified achievements/badges for user engagement';

-- ============================================================================
-- SEED DATA: DEFAULT MODES
-- ============================================================================

INSERT INTO public.public_modes (slug, title, description, icon, system_prompt, example_prompts, sort_order)
VALUES
  (
    'writing-assistant',
    'Writing Assistant',
    'Draft, edit, and rewrite clearly and professionally.',
    '✍️',
    'You are a helpful writing assistant. Be concise, clear, and structured. Help users improve their writing by suggesting better phrasing, fixing grammar, and organizing ideas logically. Always maintain the user''s voice and intent.',
    ARRAY[
      'Rewrite this email to be more professional',
      'Help me outline a 5-paragraph essay on climate change',
      'Make this sentence clearer: "The thing is that..."',
      'Draft a polite decline to a meeting invitation'
    ],
    1
  ),
  (
    'coding-buddy',
    'Coding Buddy',
    'Explain code, fix bugs, and build features with examples.',
    '💻',
    'You are a pragmatic coding assistant. Always show concise, working code examples first. Explain technical concepts clearly. Debug errors step-by-step. Follow best practices and current conventions. Ask clarifying questions when needed.',
    ARRAY[
      'Fix this TypeScript error: Cannot find name ''process''',
      'Explain what this regex does: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/',
      'Write a React component for a file upload button',
      'How do I deploy a Next.js app to Vercel?'
    ],
    2
  ),
  (
    'study-helper',
    'Study Helper',
    'Learn faster with summaries, explanations, and quizzes.',
    '📚',
    'You are a patient study assistant. Break down complex topics into simple explanations. Use analogies and examples. Create practice questions to test understanding. Adapt your teaching style to the student''s level. Encourage learning and curiosity.',
    ARRAY[
      'Explain photosynthesis like I''m 10 years old',
      'Create 5 practice questions on the French Revolution',
      'Summarize the key points of Chapter 3 in bullet form',
      'What''s the difference between DNA and RNA?'
    ],
    3
  ),
  (
    'idea-generator',
    'Idea Generator',
    'Brainstorm creative ideas for projects, content, and business.',
    '💡',
    'You are a creative brainstorming partner. Generate diverse, actionable ideas. Think outside the box while staying practical. Consider constraints and feasibility. Build on the user''s thoughts. Ask questions to spark new angles.',
    ARRAY[
      'Give me 10 blog post ideas about remote work',
      'What''s a unique startup idea I could build this weekend?',
      'Suggest names for a productivity app for students',
      'How can I make my morning routine more interesting?'
    ],
    4
  ),
  (
    'explain-anything',
    'Explain Anything',
    'Get simple explanations for complex topics and current events.',
    '🧠',
    'You are an expert explainer. Take complex topics and make them accessible to anyone. Use clear language, concrete examples, and step-by-step breakdowns. Avoid jargon unless necessary, then define it. Check for understanding and adjust detail level as needed.',
    ARRAY[
      'How does blockchain actually work?',
      'Explain quantum computing in simple terms',
      'What caused the 2008 financial crisis?',
      'Why is the sky blue? Give me the scientific reason.'
    ],
    5
  ),
  (
    'fact-finder',
    'Fact Finder',
    'Get accurate, up-to-date information and fact-checks.',
    '🔍',
    'You are a research assistant focused on accuracy. Provide factual, well-sourced information. When unsure, say so. Distinguish between facts and opinions. Update outdated information. Be concise but thorough. Cite sources when possible.',
    ARRAY[
      'What''s the current population of Tokyo?',
      'Who won the Nobel Prize in Physics in 2023?',
      'Is it true that you swallow 8 spiders a year while sleeping?',
      'What are the side effects of caffeine?'
    ],
    6
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: DEFAULT FEATURE FLAGS (All off for safe rollout)
-- ============================================================================

INSERT INTO public.feature_flags (key, value, enabled, description)
VALUES
  ('ui_casual_landing', 'false'::jsonb, true, 'New casual-friendly landing page'),
  ('ui_casual_chat', 'false'::jsonb, true, 'Refreshed chat UI with examples and cache badges'),
  ('ui_modes', 'false'::jsonb, true, 'Modes/templates system'),
  ('ui_casual_dashboard', 'false'::jsonb, true, 'Casual dashboard with achievements'),
  ('ux_gamified_toasts', 'false'::jsonb, true, 'Gamified toast notifications for cache hits'),
  ('ux_voice_input', 'false'::jsonb, true, 'Voice input for chat (Web Speech API)'),
  ('ux_file_upload', 'false'::jsonb, true, 'File upload for chat context'),
  ('ux_cache_badges', 'false'::jsonb, true, 'Cache hit badges in chat'),
  ('ux_example_prompts', 'false'::jsonb, true, 'Example prompts before first message'),
  ('ab_landing_hero_copy_v1', '"A"'::jsonb, true, 'A/B test for landing hero copy'),
  ('ab_example_prompts_layout_v1', '"grid"'::jsonb, true, 'A/B test for example prompts layout'),
  ('ab_onboarding_flow_v1', '"old"'::jsonb, true, 'A/B test for onboarding flow')
ON CONFLICT (key, user_id) DO NOTHING;

COMMENT ON TABLE public.feature_flags IS 'All flags default to OFF for safe gradual rollout';
