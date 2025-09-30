# Vercel Environment Variables Setup

## Setting CRON_SECRET in Vercel

### Why You Need This

The `CRON_SECRET` protects your cron endpoint from unauthorized access. When Vercel Cron calls your API, it includes a special header, but for extra security, we also check for this secret.

---

## Option 1: Use Vercel Cron Header Only (Easier)

Vercel Cron automatically includes the `x-vercel-cron: 1` header. Our code already checks for this, so **you don't actually need to set CRON_SECRET** if you're only using Vercel Cron.

The cron endpoint code already handles this:

```typescript
// From /app/api/cron/process-notifications/route.ts
const vercelCronHeader = request.headers.get('x-vercel-cron')
if (vercelCronHeader === '1') {
  return true  // ✅ Vercel Cron is authorized
}
```

**So you can skip setting CRON_SECRET if you want!** ✅

---

## Option 2: Set CRON_SECRET (More Secure)

If you want extra security or plan to call the endpoint from other places:

### Step 1: Generate a Secret

```bash
# On Linux/Mac/WSL
openssl rand -hex 32

# Example output:
# 7f4a9c2d8e1b6f3a5c9d2e8b1a4f6c3d9e2b5a8c1f4d7e3b6a9c2f5d8e1b4a7c
```

### Step 2: Add to Vercel

#### Via Vercel Dashboard (Recommended):

1. Go to your Vercel project: https://vercel.com/dashboard
2. Click on your project (cachegpt)
3. Go to **Settings** tab
4. Click **Environment Variables** in left sidebar
5. Click **Add New**
6. Fill in:
   - **Name**: `CRON_SECRET`
   - **Value**: Your generated secret (paste from Step 1)
   - **Environment**: Select all three (Production, Preview, Development)
7. Click **Save**

#### Via Vercel CLI:

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login
vercel login

# Add the secret
vercel env add CRON_SECRET
# Paste your secret when prompted
# Select: Production, Preview, Development (all three)
```

### Step 3: Redeploy

After adding the environment variable, redeploy:

```bash
# Trigger a redeploy
vercel --prod

# Or push to git (if auto-deploy is enabled)
git push origin main
```

---

## Verifying It Works

### Check Vercel Logs

1. Go to Vercel Dashboard > Your Project
2. Click **Deployments** tab
3. Click on latest deployment
4. Click **Functions** tab
5. Look for `/api/cron/process-notifications`
6. Check logs - should run every 5 minutes

### Manual Test

```bash
# Test the endpoint (replace with your URL)
curl -X POST https://cachegpt.app/api/cron/process-notifications

# Should return 401 Unauthorized (because you didn't include auth)

# If you set CRON_SECRET, test with it:
curl -X POST https://cachegpt.app/api/cron/process-notifications \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Should return success with stats
```

---

## All Environment Variables Needed

Here's what should be in your Vercel environment:

### Already Set (from earlier setup):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

### API Keys (for LLM providers):
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
PERPLEXITY_API_KEY=pplx-...
```

### New (add these):
```
CRON_SECRET=your-random-secret-here  # OPTIONAL (see above)
EMAIL_FROM=notifications@cachegpt.app  # OPTIONAL (has default)
```

---

## How Vercel Cron Works

### Schedule Format

```
*/5 * * * *
│  │ │ │ │
│  │ │ │ └─── Day of week (0-6, Sunday=0)
│  │ │ └───── Month (1-12)
│  │ └─────── Day of month (1-31)
│  └───────── Hour (0-23)
└─────────── Minute (0-59)
```

### Our Schedules:
- `/api/cron/model-update`: `0 6 * * *` - Daily at 6:00 AM
- `/api/cron/process-notifications`: `*/5 * * * *` - Every 5 minutes

### Vercel Cron Limits:

**Free (Hobby) Plan:**
- ✅ Unlimited cron jobs
- ✅ 1 execution per minute minimum
- ⚠️ 10 second max execution time

**Pro Plan:**
- ✅ Unlimited cron jobs
- ✅ Any schedule
- ✅ 300 second max execution time

Your cron job should complete in < 1 second, so free plan is fine.

---

## Troubleshooting

### Cron not running
1. Check Vercel Dashboard > Functions > Logs
2. Make sure you redeployed after adding cron
3. Verify `vercel.json` is committed

### 401 Unauthorized error in logs
- This is normal if called without auth header
- Vercel Cron includes `x-vercel-cron: 1` header automatically
- Check the code is allowing Vercel Cron header

### Emails not sending
1. Check cron is running: Vercel Dashboard > Functions
2. Check email function logs: `supabase functions logs send-email`
3. Verify RESEND_API_KEY is set in Supabase
4. Check Resend dashboard for delivery status

### "CRON_SECRET not defined" warning
- This is just a warning, not an error
- Vercel Cron works with `x-vercel-cron` header
- You can ignore it or set the secret

---

## Testing the Full Flow

### 1. Submit a High Priority Bug
- Go to your app
- Click bug report button
- Set priority to "High" or "Critical"
- Submit

### 2. Check Database
```sql
-- Check notification was created
SELECT * FROM bug_notifications WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5;
```

### 3. Wait for Cron (5 minutes max)
The cron job runs every 5 minutes

### 4. Check Logs
```bash
# Vercel logs
vercel logs

# Supabase logs
supabase functions logs send-email
```

### 5. Check Email
- Look in your inbox
- Check spam folder
- Check Resend dashboard: https://resend.com/logs

---

## Summary

### What You Need to Do:

**Option A: Simplest (Recommended)**
1. ✅ `vercel.json` already updated with cron
2. ✅ Just deploy/push to git
3. ✅ Vercel Cron will work automatically (no CRON_SECRET needed)

**Option B: More Secure**
1. Generate secret: `openssl rand -hex 32`
2. Add to Vercel: Dashboard > Settings > Environment Variables
3. Deploy: `vercel --prod` or `git push`

### Either way works! The code handles both scenarios.

---

## Quick Deploy Commands

```bash
cd /root/cachegpt

# Commit changes
git add vercel.json
git commit -m "feat: Add email notification cron job"

# Push (triggers auto-deploy if configured)
git push origin main

# Or deploy manually
vercel --prod
```

---

**That's it!** Your cron job will start running within 5 minutes of deployment.
