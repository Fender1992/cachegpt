# Supabase Email Verification Setup Guide

## Issue: Email verification not being sent

When users sign up, they see "Check your email to confirm your account!" but no email is received.

## Solution Steps:

### 1. Check Supabase Dashboard Email Settings

1. Go to your Supabase project: https://supabase.com/dashboard/project/slxgfzlralwbpzafbufm
2. Navigate to **Authentication** → **Email Templates**
3. Ensure email templates are enabled and configured

### 2. Configure SMTP Settings (Recommended for Production)

By default, Supabase uses their built-in email service which has rate limits. For production, configure custom SMTP:

1. Go to **Project Settings** → **Auth**
2. Scroll to **SMTP Settings**
3. Enable "Custom SMTP"
4. Configure with your email provider:

#### Example with Gmail:
- Host: smtp.gmail.com
- Port: 587
- Username: your-email@gmail.com
- Password: App-specific password (not regular password)
- Sender email: your-email@gmail.com
- Sender name: CacheGPT

#### Example with SendGrid:
- Host: smtp.sendgrid.net
- Port: 587
- Username: apikey
- Password: Your SendGrid API key
- Sender email: verified-sender@yourdomain.com
- Sender name: CacheGPT

### 3. Check Email Provider Settings

In Supabase Dashboard:
1. Go to **Authentication** → **Providers** → **Email**
2. Ensure these are enabled:
   - ✅ Enable Email provider
   - ✅ Confirm email (if you want email verification)
   - ✅ Enable sign-ups

### 4. Verify Rate Limits

Default Supabase email service has these limits:
- **Free tier**: 3 emails per hour
- **Pro tier**: 100 emails per hour

If testing multiple sign-ups, you may hit the rate limit.

### 5. Check Spam/Junk Folder

Supabase default emails often go to spam. Check:
- Spam/Junk folder
- Promotions tab (Gmail)
- All Mail folder

### 6. Test Email Configuration

Create a test file to verify email sending:

```typescript
// test-email.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://slxgfzlralwbpzafbufm.supabase.co',
  'your-service-role-key' // Use service role key for admin operations
)

async function testEmail() {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail('test@example.com')

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Email sent successfully:', data)
  }
}

testEmail()
```

### 7. Alternative: Disable Email Confirmation (Development)

For development/testing, you can disable email confirmation:

1. Go to **Authentication** → **Providers** → **Email**
2. Disable "Confirm email"
3. Users will be automatically confirmed upon sign-up

### 8. Update Redirect URLs

Ensure your redirect URLs are configured:
1. Go to **Authentication** → **URL Configuration**
2. Add your site URL to:
   - Site URL: https://your-domain.com
   - Redirect URLs:
     - http://localhost:3000/*
     - https://your-domain.com/*

### 9. Check Logs

View email sending logs:
1. Go to **Logs** → **Auth Logs**
2. Filter by email events
3. Look for any error messages

## Common Issues and Solutions:

### Issue: "Email rate limit exceeded"
**Solution**: Wait 1 hour or configure custom SMTP

### Issue: Emails going to spam
**Solution**:
- Configure custom SMTP with proper domain
- Add SPF, DKIM, DMARC records to your domain
- Use a reputable email service (SendGrid, Mailgun, etc.)

### Issue: Email not sending at all
**Solution**:
- Check if email provider is enabled
- Verify SMTP credentials
- Check firewall/network settings
- Review auth logs for errors

## Recommended Email Services:

1. **SendGrid** (Free: 100 emails/day)
2. **Mailgun** (Free: 5,000 emails/month)
3. **Amazon SES** (Cheapest for volume)
4. **Postmark** (Best deliverability)
5. **Resend** (Developer-friendly)

## Next Steps:

1. For immediate testing: Check spam folder or disable email confirmation
2. For production: Set up custom SMTP with SendGrid or similar
3. Monitor auth logs for any issues