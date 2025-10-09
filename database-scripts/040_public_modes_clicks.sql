-- Migration 040: Public Modes & Trending System
-- Created: October 8, 2025
-- Purpose: Templates/use-cases gallery with trending tracking

-- Note: public_modes table already exists from migration 034
-- This migration adds the clicks tracking and trending view

-- Create mode_clicks table for trending analytics
CREATE TABLE IF NOT EXISTS public.mode_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_slug TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT -- 'gallery', 'empty_state', 'share', etc.
);

-- Indexes for trending queries
CREATE INDEX IF NOT EXISTS idx_mode_clicks_slug ON public.mode_clicks(mode_slug);
CREATE INDEX IF NOT EXISTS idx_mode_clicks_clicked_at ON public.mode_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_mode_clicks_slug_date ON public.mode_clicks(mode_slug, clicked_at);

-- RLS policies
ALTER TABLE public.mode_clicks ENABLE ROW LEVEL SECURITY;

-- Anyone can insert clicks (for anonymous tracking)
CREATE POLICY "Anyone can track clicks" ON public.mode_clicks
  FOR INSERT
  WITH CHECK (true);

-- Users can see their own clicks
CREATE POLICY "Users can view own clicks" ON public.mode_clicks
  FOR SELECT
  USING (user_id = auth.uid());

-- Admin can see all clicks
CREATE POLICY "Admin can view all clicks" ON public.mode_clicks
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'rolandofender@gmail.com'
    )
  );

-- Create trending_modes view (last 7 days)
CREATE OR REPLACE VIEW public.trending_modes AS
SELECT
  m.slug,
  m.title,
  m.description,
  m.icon,
  COUNT(c.id) AS click_count,
  MAX(c.clicked_at) AS last_clicked
FROM public.public_modes m
LEFT JOIN public.mode_clicks c
  ON m.slug = c.mode_slug
  AND c.clicked_at > NOW() - INTERVAL '7 days'
WHERE m.is_active = true
GROUP BY m.slug, m.title, m.description, m.icon
HAVING COUNT(c.id) > 0
ORDER BY click_count DESC, last_clicked DESC
LIMIT 6;

COMMENT ON VIEW public.trending_modes IS 'Top 6 most clicked modes in last 7 days';

-- Seed additional modes (add to existing ones from migration 034)
INSERT INTO public.public_modes (slug, title, description, icon, system_prompt, example_prompts, sort_order, is_active)
VALUES
  -- Check if already exists, only insert if not
  ('debug-helper', 'Debug Helper', 'Find and fix bugs faster with systematic debugging.', '🐛',
   'You are a systematic debugging assistant. Ask clarifying questions, check assumptions, suggest experiments, and explain root causes clearly.',
   ARRAY['Why is my React component re-rendering infinitely?', 'This API call returns 500 - how do I debug it?', 'My SQL query is slow - how can I optimize it?'],
   7, true),

  ('data-analyst', 'Data Analyst', 'Analyze data, create visualizations, find insights.', '📊',
   'You are a data analysis expert. Help interpret data, suggest visualizations, find patterns, and explain statistical concepts clearly.',
   ARRAY['Analyze this CSV and find trends', 'What visualization works best for time series?', 'Explain correlation vs causation'],
   8, true),

  ('career-coach', 'Career Coach', 'Resume reviews, interview prep, career advice.', '💼',
   'You are a supportive career coach. Provide actionable advice on resumes, interviews, career transitions, and professional development.',
   ARRAY['Review my resume for a software role', 'How do I answer "Tell me about yourself"?', 'Should I negotiate this job offer?'],
   9, true)
ON CONFLICT (slug) DO NOTHING;

-- Update existing modes with better example prompts
UPDATE public.public_modes
SET example_prompts = ARRAY[
  'Rewrite this email to be more professional',
  'Help me outline a 5-paragraph essay on climate change',
  'Make this sentence clearer and more concise',
  'Draft a polite decline to a meeting invitation'
]
WHERE slug = 'writing-assistant' AND array_length(example_prompts, 1) < 4;

UPDATE public.public_modes
SET example_prompts = ARRAY[
  'Fix this TypeScript error: Cannot find name ''process''',
  'Explain what this regex does step-by-step',
  'Write a React component for a file upload button',
  'How do I deploy a Next.js app to Vercel?'
]
WHERE slug = 'coding-buddy' AND array_length(example_prompts, 1) < 4;

UPDATE public.public_modes
SET example_prompts = ARRAY[
  'Explain photosynthesis like I''m 10 years old',
  'Create 5 practice questions on the French Revolution',
  'Summarize the key points of Chapter 3',
  'What''s the difference between DNA and RNA?'
]
WHERE slug = 'study-helper' AND array_length(example_prompts, 1) < 4;

-- Comments
COMMENT ON TABLE public.mode_clicks IS 'Click tracking for trending modes calculation';
COMMENT ON COLUMN public.mode_clicks.source IS 'Where the click originated (gallery, empty_state, share)';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 040: Mode clicks tracking created successfully';
  RAISE NOTICE 'Trending view created (top 6, last 7 days)';
  RAISE NOTICE 'Seeded 3 additional modes: debug-helper, data-analyst, career-coach';
  RAISE NOTICE 'Updated example prompts for existing modes';
END $$;
