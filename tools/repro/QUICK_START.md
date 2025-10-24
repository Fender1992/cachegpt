# Quick Start - API Key Authentication Testing

**5-Minute Guide to Test CacheGPT API Key Authentication**

---

## Prerequisites

- CacheGPT running (local dev or production)
- Node.js installed (for automated tests)
- cURL installed (for manual tests)

---

## Step 1: Get a Test API Key

### Option A: Via Web UI (Easiest)

1. Go to https://cachegpt.app (or http://localhost:3000)
2. Login or create account
3. Navigate to **Settings** → **API Keys**
4. Click **"New Key"**
5. Enter name: `"Test Key"`
6. Click **"Generate"**
7. **COPY THE KEY IMMEDIATELY** (shown only once!)

### Option B: Via Script (Automated)

```bash
# Set your Supabase JWT token
export SUPABASE_TOKEN="your_jwt_token_here"

# Generate key
./generate-test-key.sh

# Output will show your new key: cgpt_sk_...
```

**Save your key**:
```bash
export CACHEGPT_API_KEY="cgpt_sk_abc123def456..."
```

---

## Step 2: Run Automated Tests

```bash
# Run the full test suite
node test-api-key-auth.js
```

**Expected Output**:
```
✅ Valid API Key         - PASS
❌ Missing Header        - PASS (correctly rejected)
❌ Wrong Header Name     - PASS (correctly rejected)
❌ Invalid Format        - PASS (correctly rejected)
❌ Non-existent Key      - PASS (correctly rejected)
✅ CORS Preflight        - PASS
✅ Request ID            - PASS

Total: 7 | Passed: 7 | Failed: 0
```

---

## Step 3: Test CORS (Optional)

```bash
./test-cors-preflight.sh
```

**Expected Output**:
```
✅ Status: 200 OK
✅ Access-Control-Allow-Origin: *
✅ Access-Control-Allow-Methods: POST, OPTIONS
✅ Access-Control-Allow-Headers: Content-Type, x-api-key, anthropic-version
   ✅ x-api-key is allowed
```

---

## Step 4: Test in Browser (Optional)

1. Open `test-minimal-client.html` in your browser
2. Enter your API key
3. Click **"Run All Tests"**
4. View results in the UI

---

## Manual Testing with cURL

### Valid Request
```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "x-api-key: $CACHEGPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 50,
    "messages": [
      {"role": "user", "content": "Say hello!"}
    ]
  }'
```

**Expected**: 200 OK with Anthropic response

### Test Wrong Header Name
```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "Authorization: Bearer $CACHEGPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 50,
    "messages": [
      {"role": "user", "content": "Say hello!"}
    ]
  }'
```

**Expected**: 401 "Invalid or missing x-api-key header"

### Test Invalid Format
```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "x-api-key: sk-ant-invalid" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 50,
    "messages": [
      {"role": "user", "content": "Say hello!"}
    ]
  }'
```

**Expected**: 401 "Invalid or missing x-api-key header. Expected format: cgpt_sk_..."

---

## Troubleshooting

### "Connection refused"

**Cause**: CacheGPT server not running

**Fix**:
```bash
cd /home/rolo/cachegpt
yarn dev
```

### "Invalid or expired API key"

**Causes**:
1. Key was revoked
2. Key expired
3. Key doesn't exist in database

**Fix**: Generate a new key (Step 1)

### "Anthropic API key not configured"

**Cause**: Server missing `ANTHROPIC_API_KEY` environment variable

**Fix**: Add to `.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your_key_here
```

### "function validate_cachegpt_api_key does not exist"

**Cause**: Database migration not applied

**Fix**:
```bash
psql -h <host> -U postgres -d postgres \
  -f database-scripts/030_cachegpt_api_keys.sql
```

---

## Common Mistakes

### ❌ Using Authorization header
```bash
curl -H "Authorization: Bearer cgpt_sk_..."  # WRONG
```

### ✅ Using x-api-key header
```bash
curl -H "x-api-key: cgpt_sk_..."  # CORRECT
```

---

### ❌ Case sensitivity
```bash
curl -H "X-Api-Key: cgpt_sk_..."  # WRONG (case matters!)
```

### ✅ Lowercase
```bash
curl -H "x-api-key: cgpt_sk_..."  # CORRECT
```

---

### ❌ Wrong key format
```bash
# Anthropic key (wrong provider)
curl -H "x-api-key: sk-ant-..."

# OpenAI key (wrong provider)
curl -H "x-api-key: sk-proj-..."
```

### ✅ CacheGPT key format
```bash
curl -H "x-api-key: cgpt_sk_<64 hex chars>"
```

---

## Next Steps

- **Read full docs**: `README.md` in this directory
- **Architecture guide**: `/docs/auth-flow.md`
- **Diagnostic report**: `/docs/API_KEY_DIAGNOSIS_REPORT.md`
- **User guide**: `/API_KEY_USAGE.md` (in repo root)

---

## Getting Help

**For Users**:
- Check the full README: `./README.md`
- Review troubleshooting: `/docs/auth-flow.md`
- Contact support: https://cachegpt.app/support

**For Developers**:
- Read architecture docs: `/docs/auth-flow.md`
- Review code locations in diagnostic report
- Run test scripts for reproduction

---

**That's it!** You should now have a working understanding of the CacheGPT API key authentication system.
