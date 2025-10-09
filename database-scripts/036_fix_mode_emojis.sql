-- Migration 036: Fix emoji encoding in public_modes
-- Created: October 8, 2025
-- Issue: Emojis showing as garbled characters due to encoding issues

-- Update emojis with proper UTF-8 encoding using Unicode escape sequences
UPDATE public.public_modes SET icon = E'\u270D\uFE0F' WHERE slug = 'writing-assistant';  -- ✍️
UPDATE public.public_modes SET icon = E'\U0001F4BB' WHERE slug = 'coding-buddy';          -- 💻
UPDATE public.public_modes SET icon = E'\U0001F4DA' WHERE slug = 'study-helper';          -- 📚
UPDATE public.public_modes SET icon = E'\U0001F4A1' WHERE slug = 'idea-generator';        -- 💡
UPDATE public.public_modes SET icon = E'\U0001F9E0' WHERE slug = 'explain-anything';      -- 🧠
UPDATE public.public_modes SET icon = E'\U0001F50D' WHERE slug = 'fact-finder';           -- 🔍
