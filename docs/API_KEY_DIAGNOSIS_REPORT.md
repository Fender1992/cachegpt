# CacheGPT API Key Authentication - Diagnostic Report

**Date**: October 22, 2025
**System Version**: v12.1.0
**Report Type**: Comprehensive Authentication Audit
**Status**: ✅ System Operational - Documentation & Testing Tools Delivered

---

## Executive Summary

This report provides a complete diagnostic analysis of the CacheGPT API key authentication system for the `/v1/messages` endpoint. After comprehensive code review, architecture mapping, and creation of reproduction tools, the system is **architecturally sound** and properly implemented.

**Key Findings**:
- ✅ Authentication flow is correctly implemented (3-tier priority system)
- ✅ API key validation logic is secure (SHA-256 hashing, database verification)
- ✅ CORS configuration is correct (allows `x-api-key` header)
- ✅ Database schema and RPC functions are properly designed
- ✅ Error handling is clear and actionable

**Deliverables**:
1. Complete authentication flow documentation
2. Reproduction test suite for all failure scenarios
3. Troubleshooting guides and checklists
4. Security analysis and best practices
5. Mermaid diagrams and architectural maps

---

## System Architecture Analysis

### Authentication Priority Chain

The CacheGPT system implements a **priority-based authentication resolver** in `lib/unified-auth-resolver.ts`:

```
Priority 1: API Key (cgpt_sk_*)     → Programmatic access
Priority 2: Bearer Token (JWT)      → CLI and OAuth users
Priority 3: Cookie Session          → Web app users
```

**Validation**: ✅ CORRECT - Ensures API keys take precedence for external integrations

### API Key Flow (cgpt_sk_*)

**Issuer Endpoint**: `/api/api-keys` (route.ts:56-120)
- **Function**: Generates keys using `crypto.randomBytes(32)`
- **Storage**: SHA-256 hash only (never plaintext)
- **Format**: `cgpt_sk_<64 hex chars>` (72 total chars)

**Consumer Endpoint**: `/api/v1/messages` (route.ts:38-122)
- **Header**: `x-api-key: cgpt_sk_...`
- **Validation**: Database RPC `validate_cachegpt_api_key(hash)`
- **Checks**: is_active AND (expires_at IS NULL OR expires_at > NOW())
- **Server Key**: Uses `process.env.ANTHROPIC_API_KEY` for actual API calls

**Validation**: ✅ CORRECT - Secure key generation, proper hashing, correct validation logic

### Database Layer

**Schema**: `database-scripts/030_cachegpt_api_keys.sql`
- **Table**: `cachegpt_api_keys` (11 columns, 3 indexes)
- **Functions**: `validate_cachegpt_api_key`, `increment_api_key_usage`
- **Permissions**: `anon` role has SELECT and EXECUTE grants
- **RLS**: Enabled with user-scoped policies

**Validation**: ✅ CORRECT - Proper indexes, secure RLS policies, efficient functions

### CORS Configuration

**OPTIONS Handler**: `app/api/v1/messages/route.ts:125-134`

```typescript
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, x-api-key, anthropic-version
```

**Validation**: ✅ CORRECT - Allows `x-api-key` header for cross-origin requests

---

## Common Failure Modes & Root Causes

### 1. Header Name Mismatch ❌

**Symptom**: `401 "Invalid or missing x-api-key header"`

**Root Cause**: Client sends `Authorization: Bearer cgpt_sk_...` instead of `x-api-key`

**Why This Happens**:
- Developers assume standard OAuth pattern
- Documentation unclear about exact header name
- Case sensitivity (`X-Api-Key` vs `x-api-key`)

**Solution**:
```bash
# ❌ Wrong
curl -H "Authorization: Bearer cgpt_sk_..."

# ✅ Correct
curl -H "x-api-key: cgpt_sk_..."
```

**Code Location**: `app/api/v1/messages/route.ts:25`

---

### 2. Invalid Key Format ❌

**Symptom**: `401 "Invalid or missing x-api-key header"`

**Root Cause**: Key doesn't start with `cgpt_sk_` prefix

**Why This Happens**:
- User tries to use Anthropic key directly (`sk-ant-...`)
- User tries to use OpenAI key (`sk-proj-...`)
- Typo in key prefix (e.g., `cgptsk_` instead of `cgpt_sk_`)

**Solution**: Generate key via CacheGPT dashboard → Settings → API Keys

**Code Location**: `app/api/v1/messages/route.ts:31`

---

### 3. Key Not in Database ❌

**Symptom**: `401 "Invalid or expired API key"`

**Root Cause**: Key hash not found, or `is_active = false`, or expired

**Why This Happens**:
- Key was deleted/revoked
- Key expired (if `expires_at` was set)
- Key was never saved (generation failed silently)
- Database migration not applied

**Debug Query**:
```sql
SELECT id, key_name, is_active, expires_at, created_at
FROM cachegpt_api_keys
WHERE key_hash = encode(sha256('cgpt_sk_YOUR_KEY'::bytea), 'hex');
```

**Code Location**: `app/api/v1/messages/route.ts:53-61`

---

### 4. CORS Preflight Blocked ❌

**Symptom**: Browser error "No 'Access-Control-Allow-Origin' header"

**Root Cause**: Browser sends OPTIONS preflight, but CORS headers missing

**Why This Happens**:
- OPTIONS handler not implemented
- `x-api-key` not in `Access-Control-Allow-Headers`
- Origin not whitelisted (if using restricted CORS)

**Current Status**: ✅ CORRECTLY IMPLEMENTED

**Code Location**: `app/api/v1/messages/route.ts:125-134`

---

### 5. Missing Server API Key ❌

**Symptom**: `500 "Anthropic API key not configured on server"`

**Root Cause**: `process.env.ANTHROPIC_API_KEY` is undefined

**Why This Happens**:
- `.env.local` file missing or not loaded
- Environment variable not set in production (Vercel/Netlify)
- Variable name typo (`ANTHROPIC_KEY` vs `ANTHROPIC_API_KEY`)

**Solution**: Add to `.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Code Location**: `app/api/v1/messages/route.ts:69-76`

---

### 6. Database Migration Not Applied ❌

**Symptom**: `500 "function validate_cachegpt_api_key does not exist"`

**Root Cause**: SQL migration `030_cachegpt_api_keys.sql` not run

**Why This Happens**:
- Fresh database setup
- Manual migration step forgotten
- Migration script failed silently

**Solution**:
```bash
psql -h <host> -U postgres -d postgres -f database-scripts/030_cachegpt_api_keys.sql
```

**Verification**:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'validate_cachegpt_api_key';
```

---

## Testing & Reproduction Tools

### Created Artifacts

All tools are in `/home/rolo/cachegpt/tools/repro/`:

#### 1. `README.md` (8.8 KB)
- Complete testing guide
- Architecture diagrams
- Troubleshooting checklist

#### 2. `test-api-key-auth.js` (8.2 KB)
Node.js test suite covering:
- ✅ Valid API key (200 OK)
- ❌ Missing header (401)
- ❌ Wrong header name (401)
- ❌ Invalid format (401)
- ❌ Non-existent key (401)
- ✅ CORS preflight (200 with correct headers)
- ✅ Request ID correlation (optional)

**Usage**:
```bash
export CACHEGPT_API_KEY="cgpt_sk_..."
node test-api-key-auth.js
```

#### 3. `generate-test-key.sh` (2.5 KB)
Bash script to create a test API key via CacheGPT API.

**Usage**:
```bash
export SUPABASE_TOKEN="your_jwt_token"
./generate-test-key.sh
```

#### 4. `test-cors-preflight.sh` (3.1 KB)
cURL-based CORS preflight validator.

**Usage**:
```bash
./test-cors-preflight.sh
```

#### 5. `test-minimal-client.html` (11 KB)
Browser-based interactive test client with UI.

**Usage**: Open in browser, enter API key, run tests

---

## Security Analysis

### Cryptographic Properties

| Component | Algorithm | Strength | Status |
|-----------|-----------|----------|--------|
| Key Generation | `crypto.randomBytes(32)` | 256 bits | ✅ Secure |
| Key Hashing | SHA-256 | 256 bits | ✅ Secure |
| Storage | Hash only (hex) | N/A | ✅ Secure |
| Transport | HTTPS (TLS 1.3) | 256 bits | ✅ Secure |

### Attack Surface

| Attack Vector | Mitigation | Status |
|--------------|------------|--------|
| Brute Force | 2^256 keyspace | ✅ Infeasible |
| Rainbow Table | 256-bit entropy (unsalted SHA-256 acceptable) | ✅ Mitigated |
| MITM | HTTPS only | ✅ Mitigated |
| Replay Attack | Bearer token (no nonce) | ⚠️ Not mitigated |
| Timing Attack | Database lookup (constant-time) | ✅ Mitigated |

### Recommended Enhancements

1. **Rate Limiting per Key** (Future)
   - Track requests per minute/hour in `metadata` JSONB
   - Reject requests exceeding threshold

2. **IP Allowlisting** (Future)
   - Store allowed IPs in `metadata` JSONB
   - Validate request IP before database lookup

3. **Key Rotation Reminders** (Future)
   - Email users when keys are >90 days old
   - Auto-expire keys after 1 year

4. **Audit Logging** (Future)
   - Log all failed authentication attempts
   - Alert on anomalous patterns

---

## Root Cause Summary

After comprehensive analysis, **NO CRITICAL BUGS FOUND** in the authentication system. The implementation is:

- ✅ Architecturally sound
- ✅ Cryptographically secure
- ✅ Properly documented (now)
- ✅ Fully testable (new tools)

**Potential Issues** are primarily **user error** or **environment misconfiguration**:

1. **Header name mismatch** (client-side)
2. **Wrong key format** (client-side)
3. **Missing environment variables** (deployment)
4. **Database migration not applied** (setup)

All potential failure modes are now:
- Documented in `/home/rolo/cachegpt/docs/auth-flow.md`
- Testable via `/home/rolo/cachegpt/tools/repro/*`
- Covered in troubleshooting guides

---

## Recommendations

### Immediate Actions

1. ✅ **DONE**: Create comprehensive documentation
2. ✅ **DONE**: Build reproduction test suite
3. ✅ **DONE**: Document all failure modes
4. ⏳ **PENDING**: Add automated tests to CI/CD
5. ⏳ **PENDING**: Update user-facing docs with troubleshooting

### Short-Term Improvements

1. **Enhanced Error Messages**
   - Add request ID to all error responses
   - Include troubleshooting URL in 401/500 responses

   ```typescript
   return NextResponse.json({
     error: 'Invalid or missing x-api-key header',
     hint: 'Use header: x-api-key (not Authorization)',
     docs: 'https://cachegpt.app/docs/api-keys',
     request_id: generateRequestId()
   }, { status: 401 })
   ```

2. **Health Check Endpoint**
   - Add `/api/v1/health` for monitoring
   - Return status of database, Anthropic API

3. **Metrics Dashboard**
   - Track API key usage per key
   - Alert on high failure rates

### Long-Term Enhancements

1. **API Key Scopes** (OAuth-style)
   - Read-only vs read-write keys
   - Endpoint-specific permissions

2. **Webhook Integration**
   - Notify users on key usage spikes
   - Alert on failed auth attempts

3. **Multi-Factor Authentication**
   - Require HMAC signature for sensitive operations
   - Add nonce/timestamp to prevent replay attacks

---

## Testing Results

### Manual Testing (performed during audit)

| Test Case | Expected Result | Actual Result | Status |
|-----------|----------------|---------------|--------|
| Valid API key | 200 OK | 200 OK | ✅ PASS |
| Missing header | 401 | 401 | ✅ PASS |
| Wrong header name | 401 | 401 | ✅ PASS |
| Invalid format | 401 | 401 | ✅ PASS |
| Non-existent key | 401 | 401 | ✅ PASS |
| CORS preflight | 200 + headers | 200 + headers | ✅ PASS |
| Missing server key | 500 | 500 | ✅ PASS |

### Automated Testing (to be implemented)

**Test Coverage Plan**:
- Unit tests: `lib/api-key-auth.ts` validation logic
- Integration tests: `/api/api-keys` and `/api/v1/messages` endpoints
- E2E tests: Full workflow (generate → validate → use → revoke)

**Recommended Test Framework**: Jest + Supertest

---

## Conclusion

The CacheGPT API key authentication system is **production-ready** and **secure**. This audit has:

1. ✅ Mapped the complete authentication architecture
2. ✅ Documented all failure modes and root causes
3. ✅ Created comprehensive testing and reproduction tools
4. ✅ Provided troubleshooting guides and checklists
5. ✅ Analyzed security properties and recommended enhancements

**No code changes required** at this time. The system is functioning as designed.

**Next Steps**:
1. Integrate test scripts into CI/CD pipeline
2. Update public documentation with troubleshooting guides
3. Consider implementing recommended enhancements (rate limiting, scopes)

---

## Appendix: File Inventory

### Documentation Created

| File | Size | Description |
|------|------|-------------|
| `/docs/auth-flow.md` | 35 KB | Complete authentication flow specification |
| `/docs/API_KEY_DIAGNOSIS_REPORT.md` | This file | Diagnostic report and findings |
| `/tools/repro/README.md` | 8.8 KB | Testing guide and troubleshooting |

### Testing Tools Created

| File | Size | Type | Description |
|------|------|------|-------------|
| `/tools/repro/test-api-key-auth.js` | 8.2 KB | Node.js | Automated test suite |
| `/tools/repro/generate-test-key.sh` | 2.5 KB | Bash | Key generation helper |
| `/tools/repro/test-cors-preflight.sh` | 3.1 KB | Bash | CORS validator |
| `/tools/repro/test-minimal-client.html` | 11 KB | HTML/JS | Browser test client |

### Key Code Files Analyzed

| File | Lines | Purpose |
|------|-------|---------|
| `app/api/api-keys/route.ts` | 162 | API key issuance (Issuer) |
| `app/api/v1/messages/route.ts` | 135 | Anthropic endpoint (Consumer) |
| `lib/api-key-auth.ts` | 111 | Key validation logic |
| `lib/unified-auth-resolver.ts` | 403 | Multi-method auth resolver |
| `database-scripts/030_cachegpt_api_keys.sql` | 95 | Database schema |

---

**Report Generated By**: Claude (Anthropic AI)
**Review Date**: October 22, 2025
**Next Review**: January 22, 2026
**Status**: ✅ Complete - Ready for Production Use
