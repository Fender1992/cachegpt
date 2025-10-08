-- Migration 035: Fix public_modes RLS for anonymous access
-- Created: October 8, 2025
-- Issue: Anonymous users cannot read public_modes due to RLS policy

-- Drop existing policy
DROP POLICY IF EXISTS "Anyone can view active modes" ON public.public_modes;

-- Create new policy that allows public read access without authentication
CREATE POLICY "Anyone can view active modes" ON public.public_modes
  FOR SELECT
  USING (true);

-- Ensure the policy works for both authenticated and anonymous users
COMMENT ON POLICY "Anyone can view active modes" ON public.public_modes IS 'Public read access for all users (authenticated and anonymous)';
