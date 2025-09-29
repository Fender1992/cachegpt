-- =====================================================
-- DEBUG AUTH ISSUE - Find out what's blocking signup
-- =====================================================

-- Check 1: Does user_profiles table exist?
SELECT
    'Table Exists' as check_name,
    EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'user_profiles'
    )::text as result;

-- Check 2: What columns does it have?
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Check 3: What's the RLS status?
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'user_profiles';

-- Check 4: What policies exist?
SELECT
    policyname,
    permissive,
    cmd,
    roles
FROM pg_policies
WHERE tablename = 'user_profiles';

-- Check 5: Does the trigger exist and what's its definition?
SELECT
    tgname as trigger_name,
    tgtype,
    tgenabled as enabled,
    tgisinternal as is_internal
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Check 6: What's the function definition?
SELECT
    proname as function_name,
    prosecdef as has_security_definer,
    proacl as access_list
FROM pg_proc
WHERE proname = 'handle_new_user';

-- Check 7: Check auth.users trigger
SELECT
    t.tgname,
    t.tgrelid::regclass as table_name,
    p.proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'auth.users'::regclass;

-- Check 8: Can we insert directly? (This will actually try it)
DO $$
DECLARE
    test_id uuid := gen_random_uuid();
    result text;
BEGIN
    BEGIN
        INSERT INTO public.user_profiles (id, email, created_at, updated_at)
        VALUES (test_id, 'debug-test@example.com', NOW(), NOW());

        DELETE FROM public.user_profiles WHERE id = test_id;
        result := '✅ Direct insert WORKS';
    EXCEPTION WHEN others THEN
        result := '❌ Direct insert FAILS: ' || SQLERRM;
    END;

    RAISE NOTICE 'Insert Test Result: %', result;
END $$;

-- Check 9: Look for any other triggers on auth.users
SELECT
    'Other auth.users triggers' as info,
    string_agg(tgname, ', ') as triggers
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
AND tgname != 'on_auth_user_created';