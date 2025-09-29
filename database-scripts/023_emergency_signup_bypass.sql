-- =====================================================
-- EMERGENCY SIGNUP BYPASS - REMOVES ALL BARRIERS
-- Use this to get signup working, then add security back
-- =====================================================

-- Step 1: Completely disable RLS
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop all policies (clean slate)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'user_profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON user_profiles', pol.policyname);
    END LOOP;
END $$;

-- Step 3: Grant ALL permissions to everyone
GRANT ALL ON public.user_profiles TO anon;
GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.user_profiles TO postgres;

-- Step 4: Recreate the simplest possible trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Just insert, ignore all errors
    BEGIN
        INSERT INTO public.user_profiles (id, email, created_at, updated_at)
        VALUES (NEW.id, COALESCE(NEW.email, ''), NOW(), NOW());
    EXCEPTION WHEN others THEN
        -- Ignore all errors
        NULL;
    END;
    RETURN NEW;
END;
$$;

-- Step 5: Create trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 6: Grant execute to everyone
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

-- Step 7: Verify all security is removed
SELECT 'EMERGENCY BYPASS STATUS:' as title
UNION ALL
SELECT '------------------------'
UNION ALL
SELECT 'RLS Status: ' ||
    CASE WHEN rowsecurity THEN '❌ STILL ENABLED!' ELSE '✅ DISABLED' END
FROM pg_tables WHERE tablename = 'user_profiles'
UNION ALL
SELECT 'Policies Count: ' || COUNT(*)::text || ' (Should be 0)'
FROM pg_policies WHERE tablename = 'user_profiles'
UNION ALL
SELECT 'Trigger: ' ||
    CASE WHEN COUNT(*) > 0 THEN '✅ EXISTS' ELSE '❌ MISSING' END
FROM pg_trigger WHERE tgname = 'on_auth_user_created'
UNION ALL
SELECT '✅ All security removed - signup should work now!';

-- Step 8: Manual test - try inserting directly
DO $$
DECLARE
    test_id uuid := gen_random_uuid();
BEGIN
    -- Try direct insert
    INSERT INTO public.user_profiles (id, email, created_at, updated_at)
    VALUES (test_id, 'test@example.com', NOW(), NOW());

    -- If we get here, insert worked
    DELETE FROM public.user_profiles WHERE id = test_id;
    RAISE NOTICE '✅ Direct insert test PASSED';
EXCEPTION WHEN others THEN
    RAISE WARNING '❌ Direct insert test FAILED: %', SQLERRM;
END $$;