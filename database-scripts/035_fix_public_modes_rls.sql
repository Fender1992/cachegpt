-- Migration 035: Fix public_modes RLS for anonymous access
-- Created: October 8, 2025
-- Issue: Anonymous users cannot read public_modes due to RLS policy

-- Drop existing policy
DROP POLICY IF EXISTS "Anyone can view active modes" ON public.public_modes;

-- Create new policy that explicitly allows anonymous access
CREATE POLICY "Anyone can view active modes" ON public.public_modes
  FOR SELECT
  USING (is_active = true OR auth.uid() IS NOT NULL);

-- Ensure the policy works for both authenticated and anonymous users
COMMENT ON POLICY "Anyone can view active modes" ON public.public_modes IS 'Allows both anonymous and authenticated users to read active modes';
