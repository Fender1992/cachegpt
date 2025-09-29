# Supabase Security Recommendations for CacheGPT

## Current State (UNSAFE - Temporary for Signup Fix)

Currently, the `user_profiles` table has:
- ❌ RLS DISABLED
- ❌ PUBLIC has full permissions
- ❌ No access restrictions

This was necessary to fix the signup issue but should be secured ASAP.

## Recommended Security Implementation

### 1. Re-enable RLS with Proper Policies

```sql
-- Step 1: Re-enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Step 2: Remove PUBLIC permissions
REVOKE ALL ON public.user_profiles FROM PUBLIC;

-- Step 3: Create secure policies
-- Users can only see their own profile
CREATE POLICY "users_view_own" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "users_update_own" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role bypass for admin operations
CREATE POLICY "service_role_bypass" ON user_profiles
  FOR ALL TO service_role
  USING (true);
```

### 2. Secure the Signup Trigger

```sql
-- Create a secure trigger function that uses a service account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create profile for verified auth users
  IF NEW.email IS NOT NULL AND NEW.id IS NOT NULL THEN
    INSERT INTO public.user_profiles (
      id, email, provider, created_at
    ) VALUES (
      NEW.id, NEW.email, 'email', NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Set function owner to a service account
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
```

### 3. API Key Security

```sql
-- Create secure table for API keys
CREATE TABLE user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- Store bcrypt hash, not plaintext
  key_preview TEXT, -- Last 4 chars only
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own keys
CREATE POLICY "users_manage_own_keys" ON user_api_keys
  FOR ALL USING (auth.uid() = user_id);
```

### 4. Rate Limiting

```sql
-- Create rate limiting table
CREATE TABLE rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  endpoint TEXT NOT NULL,
  requests_count INT DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint, window_start)
);

-- Function to check rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_limit INT,
  p_window_minutes INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INT;
BEGIN
  -- Count requests in current window
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start > NOW() - INTERVAL '1 minute' * p_window_minutes;

  RETURN v_count < p_limit;
END;
$$ LANGUAGE plpgsql;
```

### 5. Data Encryption

```sql
-- Use Supabase Vault for sensitive data
-- Store API keys encrypted
CREATE OR REPLACE FUNCTION store_api_key(
  p_user_id UUID,
  p_provider TEXT,
  p_key TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO vault.secrets (
    name,
    secret,
    description
  ) VALUES (
    format('api_key_%s_%s', p_user_id, p_provider),
    p_key,
    format('API key for user %s provider %s', p_user_id, p_provider)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6. Audit Logging

```sql
-- Create audit log table
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for audit logging
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id, action, table_name, record_id,
    old_data, new_data
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to sensitive tables
CREATE TRIGGER audit_user_profiles
  AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

### 7. Secure Cache Data

```sql
-- Add RLS to cache tables
ALTER TABLE cache_entries ENABLE ROW LEVEL SECURITY;

-- Users can only see their own cached data
CREATE POLICY "users_view_own_cache" ON cache_entries
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_public = true -- Public cache entries
  );

-- Only service role can write to cache
CREATE POLICY "service_write_cache" ON cache_entries
  FOR INSERT TO service_role USING (true);
```

## Implementation Plan

### Phase 1: Immediate (After Signup is Working)
1. Re-enable RLS on `user_profiles`
2. Create basic policies for user access
3. Remove PUBLIC permissions

### Phase 2: Short Term (1 Week)
1. Implement API key encryption
2. Add rate limiting
3. Set up audit logging

### Phase 3: Long Term (1 Month)
1. Implement full data encryption
2. Add anomaly detection
3. Set up monitoring and alerts

## Security Best Practices

### 1. Environment Variables
- Never commit `.env` files
- Use different keys for dev/staging/prod
- Rotate keys regularly

### 2. Database Access
- Use service role keys only on backend
- Never expose service keys to client
- Use anon keys for client-side operations

### 3. Authentication
- Enable email confirmation for production
- Implement 2FA for premium users
- Set strong password requirements

### 4. API Security
- Implement request signing
- Add CORS restrictions
- Use HTTPS only

### 5. Monitoring
```sql
-- Monitor suspicious activity
CREATE OR REPLACE VIEW suspicious_activity AS
SELECT
  user_id,
  COUNT(*) as request_count,
  COUNT(DISTINCT ip_address) as unique_ips,
  MAX(created_at) as last_activity
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 100 -- More than 100 requests/hour
   OR COUNT(DISTINCT ip_address) > 5; -- From more than 5 IPs
```

## Testing Security

### 1. Test RLS Policies
```sql
-- Test as different user
SET LOCAL ROLE authenticated;
SET LOCAL auth.uid = 'test-user-id';

-- Should only see own profile
SELECT * FROM user_profiles;
```

### 2. Penetration Testing
- Test SQL injection
- Test XSS vulnerabilities
- Test CSRF protection
- Test rate limiting

### 3. Regular Audits
- Review access logs weekly
- Check for unused API keys
- Monitor rate limit violations
- Review permission changes

## Emergency Response

### If Compromised:
1. **Immediately**:
   ```sql
   -- Disable all access
   ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
   ```

2. **Rotate all keys**:
   - Supabase anon key
   - Service role key
   - API keys
   - JWT secret

3. **Audit**:
   - Check audit logs
   - Identify compromised accounts
   - Notify affected users

4. **Recovery**:
   - Re-enable security with new keys
   - Force password resets
   - Implement additional monitoring

## Compliance Considerations

### GDPR Compliance
- Implement data deletion on request
- Provide data export functionality
- Clear consent for data processing
- Privacy policy compliance

### Data Retention
```sql
-- Auto-delete old cache entries
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Delete cache older than 90 days
  DELETE FROM cache_entries
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Delete audit logs older than 1 year
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron
SELECT cron.schedule('cleanup_old_data', '0 0 * * *', 'SELECT cleanup_old_data()');
```

## Contact for Security Issues

**Security Team**: security@cachegpt.io
**Emergency**: Use Supabase dashboard emergency controls
**Documentation**: https://supabase.com/docs/guides/auth/row-level-security

## Remember

The current DISABLED RLS state is temporary. Once signup is confirmed working:
1. Apply Phase 1 security immediately
2. Monitor for any issues
3. Gradually implement remaining phases
4. Never leave PUBLIC access enabled in production