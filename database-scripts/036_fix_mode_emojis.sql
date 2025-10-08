-- Migration 036: Fix emoji encoding in public_modes
-- Created: October 8, 2025
-- Issue: Emojis showing as garbled characters due to encoding issues

-- Update emojis with proper UTF-8 encoding
UPDATE public.public_modes SET icon = '✍️' WHERE slug = 'writing-assistant';
UPDATE public.public_modes SET icon = '💻' WHERE slug = 'coding-buddy';
UPDATE public.public_modes SET icon = '📚' WHERE slug = 'study-helper';
UPDATE public.public_modes SET icon = '💡' WHERE slug = 'idea-generator';
UPDATE public.public_modes SET icon = '🧠' WHERE slug = 'explain-anything';
UPDATE public.public_modes SET icon = '🔍' WHERE slug = 'fact-finder';
