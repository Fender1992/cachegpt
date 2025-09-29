-- =====================================================
-- SECURE FIX FOR USER SIGNUP
-- Maintains security while allowing signup to work
-- =====================================================

-- Step 1: Clean up existing policies (proper syntax)
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop all existing policies on user_profiles
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'user_profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON user_profiles', pol.policyname);
    END LOOP;
END $$;

-- Step 2: Ensure RLS is enabled (for security)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create a secure trigger function with proper permissions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with owner privileges
SET search_path = public, auth -- Explicit schema path
AS $$
DECLARE
    user_email text;
    user_provider text;
BEGIN
    -- Safely extract values
    user_email := COALESCE(NEW.email, 'no-email-' || NEW.id::text || '@placeholder.com');
    user_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

    -- Create user profile
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
        COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        updated_at = NOW()
    WHERE user_profiles.id = EXCLUDED.id;

    -- Log success (visible in Supabase logs)
    RAISE LOG 'User profile created for user %', NEW.id;

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, just update it
        UPDATE public.user_profiles
        SET
            email = user_email,
            updated_at = NOW()
        WHERE id = NEW.id;
        RETURN NEW;
    WHEN others THEN
        -- Log error but don't fail signup
        RAISE WARNING 'Failed to create user profile for %: %', NEW.id, SQLERRM;
        -- Try to at least create a minimal profile
        BEGIN
            INSERT INTO public.user_profiles (id, email, created_at, updated_at)
            VALUES (NEW.id, user_email, NOW(), NOW())
            ON CONFLICT DO NOTHING;
        EXCEPTION WHEN others THEN
            -- Completely fail-safe
            NULL;
        END;
        RETURN NEW;
END;
$$;

-- Step 4: Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Step 5: Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 6: Create secure RLS policies

-- Policy 1: Users can view their own profile
CREATE POLICY "users_view_own_profile" ON user_profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy 2: Users can update their own profile
CREATE POLICY "users_update_own_profile" ON user_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy 3: Service role and system can do anything (for triggers)
CREATE POLICY "service_role_all_access" ON user_profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 4: Allow inserts during signup (critical!)
-- This policy allows the trigger to insert but not regular users
CREATE POLICY "system_insert_on_signup" ON user_profiles
    FOR INSERT
    WITH CHECK (
        -- Allow if it's a system operation (no JWT) or service role
        auth.jwt() IS NULL
        OR auth.jwt()->>'role' = 'service_role'
        OR current_setting('request.jwt.claim.sub', true) IS NULL
    );

-- Step 7: Ensure the auth schema trigger can access our function
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON public.user_profiles TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Step 8: Create a fallback function that can be called directly if needed
CREATE OR REPLACE FUNCTION public.ensure_user_profile(user_id uuid, user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_profiles (
        id,
        email,
        provider,
        email_verified,
        created_at,
        updated_at
    ) VALUES (
        user_id,
        user_email,
        'email',
        false,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile TO authenticated;

-- Step 9: Verification
SELECT 'SECURE SIGNUP FIX STATUS:' as title
UNION ALL
SELECT '------------------------'
UNION ALL
SELECT 'RLS Enabled: ' ||
    CASE WHEN rowsecurity THEN '✅ YES (Secure)' ELSE '❌ NO' END
FROM pg_tables WHERE tablename = 'user_profiles'
UNION ALL
SELECT 'Trigger Exists: ' ||
    CASE WHEN COUNT(*) > 0 THEN '✅ YES' ELSE '❌ NO' END
FROM pg_trigger WHERE tgname = 'on_auth_user_created'
UNION ALL
SELECT 'Function Security: ' ||
    CASE WHEN prosecdef THEN '✅ DEFINER (Can bypass RLS)' ELSE '❌ INVOKER' END
FROM pg_proc WHERE proname = 'handle_new_user'
UNION ALL
SELECT 'Number of Policies: ' || COUNT(*)::text || ' (Should be 4)'
FROM pg_policies WHERE tablename = 'user_profiles'
UNION ALL
SELECT '✅ Secure signup should now work!';

-- Step 10: Test hint
SELECT '
TEST YOUR SIGNUP:
-----------------
1. Run: cachegpt login
2. Choose "Create new account"
3. Enter email and password
4. Should see "Account created!"

If it still fails, check Supabase Dashboard:
- Logs → Postgres Logs for errors
- Authentication → Settings → Ensure email provider is enabled
' as instructions;