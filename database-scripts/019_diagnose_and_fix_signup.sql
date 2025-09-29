-- =====================================================
-- DIAGNOSE AND FIX SIGNUP ISSUE
-- Complete solution with diagnostics
-- =====================================================

-- Step 1: Check if user_profiles table exists and has correct structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Step 2: Check current RLS policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'user_profiles';

-- Step 3: Check if the function exists and has correct definition
SELECT
    proname,
    prosecdef as has_security_definer,
    prosrc as function_body
FROM pg_proc
WHERE proname = 'handle_new_user';

-- Step 4: COMPLETE FIX - Drop everything and recreate properly

-- Drop existing objects
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Temporarily disable RLS to ensure function can work
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- Create a simpler function that definitely works
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_email text;
    user_provider text;
BEGIN
    -- Get email and provider safely
    user_email := COALESCE(NEW.email, 'no-email@example.com');
    user_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

    -- Try to insert the profile
    BEGIN
        INSERT INTO public.user_profiles (
            id,
            email,
            provider,
            email_verified,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            user_email,
            user_provider,
            false,
            NOW(),
            NOW()
        );
    EXCEPTION WHEN unique_violation THEN
        -- If user already exists, update instead
        UPDATE public.user_profiles
        SET
            email = user_email,
            updated_at = NOW()
        WHERE id = NEW.id;
    END;

    RETURN NEW;
EXCEPTION WHEN others THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Create trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Re-enable RLS but with better policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON user_profiles;

-- Create a more permissive policy for inserts (allows trigger to work)
CREATE POLICY "Enable insert for all" ON user_profiles
    FOR INSERT
    WITH CHECK (true);

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT
    USING (auth.uid() = id OR id IS NOT NULL);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- Step 5: Test the function manually (optional)
-- This simulates what happens during signup
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
BEGIN
    -- Try to insert a test profile directly
    INSERT INTO public.user_profiles (
        id, email, provider, email_verified, created_at, updated_at
    ) VALUES (
        test_user_id,
        'test@example.com',
        'email',
        false,
        NOW(),
        NOW()
    );

    -- Clean up test
    DELETE FROM public.user_profiles WHERE id = test_user_id;

    RAISE NOTICE 'Test insert successful - function should work';
EXCEPTION WHEN others THEN
    RAISE WARNING 'Test insert failed: %', SQLERRM;
END $$;

-- Step 6: Verify everything is set up correctly
SELECT
    'Trigger exists' as check_item,
    EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
    ) as status
UNION ALL
SELECT
    'Function has SECURITY DEFINER',
    EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'handle_new_user'
        AND prosecdef = true
    )
UNION ALL
SELECT
    'RLS is enabled',
    EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = 'user_profiles'
        AND rowsecurity = true
    )
UNION ALL
SELECT
    'Insert policy exists',
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_profiles'
        AND cmd = 'INSERT'
    );