# How to Deploy the Supabase Email Function

## The Problem

You're running the deploy command from the wrong directory. Supabase CLI needs to be run from **your project directory** where the `supabase/` folder exists.

## Solution

### Option 1: Navigate to Your Project Directory

```bash
# From /mnt/c/Users/ADMIN, navigate to your project
cd /root/cachegpt

# Now deploy
supabase functions deploy send-email
```

### Option 2: Copy Files to Windows Directory

If you want to run it from your Windows user directory:

```bash
# Copy the supabase folder to your Windows directory
cp -r /root/cachegpt/supabase /mnt/c/Users/ADMIN/

# Now you can run from /mnt/c/Users/ADMIN
cd /mnt/c/Users/ADMIN
supabase functions deploy send-email
```

---

## Full Deployment Steps

### 1. Navigate to Project Directory
```bash
cd /root/cachegpt
```

### 2. Verify File Exists
```bash
ls -la supabase/functions/send-email/index.ts
# Should show the file
```

### 3. Link Project (if not already linked)
```bash
# Find your project ref from Supabase dashboard URL
# Example: https://app.supabase.com/project/slxgfzlralwbpzafbufm
# Your ref is: slxgfzlralwbpzafbufm

supabase link --project-ref slxgfzlralwbpzafbufm
```

### 4. Set Resend API Key
```bash
# Get your Resend API key from https://resend.com/api-keys
supabase secrets set RESEND_API_KEY=re_your_key_here
```

### 5. Deploy Function
```bash
supabase functions deploy send-email
```

You should see:
```
✓ Deployed Function send-email
Function URL: https://slxgfzlralwbpzafbufm.supabase.co/functions/v1/send-email
```

---

## Troubleshooting

### Error: "entrypoint path does not exist"
**Cause**: Running from wrong directory
**Solution**: Run `cd /root/cachegpt` first

### Error: "Project not linked"
**Solution**:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Error: "Login required"
**Solution**:
```bash
supabase login
```

### Error: "RESEND_API_KEY not set"
**Solution**:
```bash
supabase secrets set RESEND_API_KEY=re_your_key
```

---

## Quick Command Sequence

Just copy and paste this (update the API key):

```bash
# Navigate to project
cd /root/cachegpt

# Link project (if needed)
supabase link --project-ref slxgfzlralwbpzafbufm

# Set API key (get from resend.com)
supabase secrets set RESEND_API_KEY=re_your_resend_key_here

# Deploy function
supabase functions deploy send-email
```

---

## After Deployment

Test the function:

```bash
curl -X POST 'https://slxgfzlralwbpzafbufm.supabase.co/functions/v1/send-email' \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "from": "onboarding@resend.dev",
    "subject": "Test",
    "html": "<h1>It works!</h1>",
    "text": "It works!"
  }'
```

Get your anon key from: Supabase Dashboard > Settings > API

---

## Code Changes Status

✅ **All code changes are committed** to `/root/cachegpt`
❌ **Not pushed to remote** (if you have a git remote configured)

To push:
```bash
cd /root/cachegpt
git add .
git commit -m "feat: Add RBAC, email notifications, and screenshot upload (v11.11.0)"
git push origin main
```
