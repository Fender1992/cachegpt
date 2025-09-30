# Supabase Email - Quick Start Guide

## What You're Setting Up

Your app needs to send emails when high/critical bugs are reported. Since you're already using Supabase, you can use their built-in email system for free (3,000 emails/month).

---

## Prerequisites

✅ You already have:
- Supabase project running
- `NEXT_PUBLIC_SUPABASE_URL` configured
- `SUPABASE_SERVICE_KEY` configured

---

## Setup Steps (5 minutes)

### Step 1: Get a Resend Account (2 minutes)

Supabase uses Resend to send emails. You need a free Resend account:

1. Go to **https://resend.com**
2. Click "Sign Up" (top right)
3. Create a free account (Google/GitHub login available)
4. Go to **API Keys** in the left sidebar
5. Click **"Create API Key"**
6. Give it a name: `CacheGPT Notifications`
7. Copy the key (starts with `re_`)

**Important**: Save this key somewhere - you'll need it in Step 3.

---

### Step 2: Install Supabase CLI (1 minute)

You already ran `/login`, so you're authenticated. If you don't have the CLI installed:

```bash
# Check if installed
supabase --version

# If not installed, install it:
npm install -g supabase
```

---

### Step 3: Link Your Project (1 minute)

```bash
# Find your project ref in Supabase dashboard URL
# Example: https://app.supabase.com/project/abc123def456
# Your ref is: abc123def456

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# When prompted, use your database password
```

**Can't remember your project ref?**
- Go to https://app.supabase.com
- Click your project
- Look at the URL: `https://app.supabase.com/project/YOUR_REF_HERE`

---

### Step 4: Set the Resend API Key (30 seconds)

```bash
# Set the API key you got from Step 1
supabase secrets set RESEND_API_KEY=re_your_key_from_step_1

# Verify it was set
supabase secrets list
```

You should see `RESEND_API_KEY` in the list.

---

### Step 5: Deploy the Email Function (1 minute)

```bash
# Deploy the function
supabase functions deploy send-email

# You should see:
# ✓ Deployed Function send-email
# Function URL: https://YOUR_PROJECT.supabase.co/functions/v1/send-email
```

---

### Step 6: Test It (30 seconds)

```bash
# Test the function (replace YOUR_PROJECT_REF and YOUR_EMAIL)
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email' \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "YOUR_EMAIL@example.com",
    "from": "onboarding@resend.dev",
    "subject": "Test Email from CacheGPT",
    "html": "<h1>It works!</h1><p>Your email system is configured.</p>",
    "text": "It works! Your email system is configured."
  }'
```

**Where to find YOUR_SUPABASE_ANON_KEY:**
- Supabase Dashboard > Settings > API > Project API keys > `anon` `public`

**Check your email** - you should receive the test email within seconds.

---

## Done! 🎉

Your app will now automatically use Supabase for sending bug notification emails. No code changes needed - it detects Supabase automatically.

---

## How to Use

### Submit a Bug Report

1. Go to your app (e.g., https://cachegpt.app)
2. Click the red bug button (bottom right)
3. Fill in bug details
4. Set priority to **High** or **Critical**
5. Submit

### What Happens:

1. Bug is saved to database ✅
2. Notification is added to queue ✅
3. Cron job processes queue (every 5 minutes) ✅
4. Email sent to all admins ✅

---

## Set Up the Cron Job

The cron job processes the email queue. Choose one:

### Option A: Vercel Cron (Recommended if using Vercel)

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/process-notifications",
    "schedule": "*/5 * * * *"
  }]
}
```

Then deploy: `vercel --prod`

### Option B: External Cron (Any hosting)

Set up a cron job to call your API every 5 minutes:

```bash
# Add this to your crontab (crontab -e)
*/5 * * * * curl -X POST https://cachegpt.app/api/cron/process-notifications \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Set `CRON_SECRET` in your environment:
```bash
CRON_SECRET=your_random_secret_here
```

### Option C: GitHub Actions (Free for public repos)

Create `.github/workflows/cron-notifications.yml`:
```yaml
name: Process Email Notifications
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Process notifications
        run: |
          curl -X POST https://cachegpt.app/api/cron/process-notifications \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to GitHub Secrets.

---

## Troubleshooting

### "Function not found"
**Solution**: Make sure you deployed the function:
```bash
supabase functions deploy send-email
```

### "RESEND_API_KEY not configured"
**Solution**: Set the secret:
```bash
supabase secrets set RESEND_API_KEY=re_your_key
```

### "Failed to send email"
**Common causes**:
1. **Invalid "from" address**: Use `onboarding@resend.dev` for testing
2. **Resend free tier**: Can only send from verified domains
3. **API key invalid**: Double-check the key from Resend dashboard

**Solution**: For production, verify your domain in Resend:
1. Go to Resend > Domains
2. Add your domain
3. Add DNS records
4. Update `EMAIL_FROM` env variable

### No emails arriving
1. **Check spam folder**
2. **Wait 5 minutes** for cron job to run
3. **Check logs**:
   ```bash
   supabase functions logs send-email
   ```
4. **Check Resend dashboard**: https://resend.com/logs

---

## Environment Variables Summary

Your app needs these (you should already have them):

```bash
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Cron authentication (add this)
CRON_SECRET=your-random-secret

# Optional - custom sender email
EMAIL_FROM=notifications@yourdomain.com  # Defaults to notifications@cachegpt.app
```

---

## Cost

**Completely Free** for most use cases:

- **Resend Free Tier**: 3,000 emails/month
- **Supabase Edge Functions**: Included in free tier
- **Your App**: No code changes needed

Only upgrade if you send 100+ bug notifications per day (3,000+/month).

---

## Summary - What You Need to Do

1. ✅ Sign up at resend.com (free)
2. ✅ Get API key from Resend
3. ✅ Run: `supabase link --project-ref YOUR_REF`
4. ✅ Run: `supabase secrets set RESEND_API_KEY=re_your_key`
5. ✅ Run: `supabase functions deploy send-email`
6. ✅ Set up cron job (Vercel/GitHub/crontab)
7. ✅ Test by submitting a high-priority bug

**Total time: 5 minutes**

---

## Questions?

- **Can't find project ref?** Check your Supabase dashboard URL
- **Don't have supabase CLI?** Run: `npm install -g supabase`
- **Need help with DNS?** Use `onboarding@resend.dev` for testing
- **Want to skip emails?** System works fine without - emails just won't send

---

**Need more help?** Open an issue or check:
- `/STATUS_2025_09_24.md` - Full technical details
- `/SUPABASE_EMAIL_SETUP.md` - Extended documentation
- `/V11_11_RELEASE_NOTES.md` - Complete release notes
