# Fix Google OAuth "redirect_uri_mismatch" Error

## The Problem
Google OAuth is showing "Error 400: redirect_uri_mismatch" because the redirect URI your app is using doesn't match what's configured in the Google Cloud Console.

## Solution

### Step 1: Identify Your Redirect URIs

Your app uses these redirect URIs:
- **Local Development**: `http://localhost:3000/auth/callback`
- **Production**: `https://yourdomain.com/auth/callback`

### Step 2: Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create one if needed)
3. Navigate to **APIs & Services** > **Credentials**
4. Find your OAuth 2.0 Client ID and click on it
5. In the **Authorized redirect URIs** section, add these EXACT URIs:

```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://127.0.0.1:3000/auth/callback
https://yourdomain.com/auth/callback
```

⚠️ **IMPORTANT**: Replace `yourdomain.com` with your actual domain if deployed.

### Step 3: Update Supabase Dashboard (if using Supabase Auth)

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication** > **Providers**
3. Click on **Google**
4. Make sure these are configured:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret
   - **Authorized Client IDs**: Your Client ID again
5. In **Redirect URLs**, add:
   ```
   http://localhost:3000/auth/callback
   https://yourdomain.com/auth/callback
   ```

### Step 4: Verify Your Environment Variables

Check `.env.local` has the correct Google OAuth credentials:

```env
# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret

# Supabase (if using Supabase Auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 5: Update Your Code (if needed)

The redirect URL in `/components/auth/auth-form.tsx` should be:

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    // For Google specific params:
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
})
```

### Step 6: Create the Callback Page (if missing)

Create `/app/auth/callback/route.ts`:

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to home page after auth
  return NextResponse.redirect(new URL('/', requestUrl.origin))
}
```

## Common Issues and Fixes

### Issue 1: "redirect_uri_mismatch"
**Cause**: URI in app doesn't match Google Console
**Fix**: Ensure EXACT match including protocol (http/https), domain, port, and path

### Issue 2: Works locally but not in production
**Cause**: Production URL not added to Google Console
**Fix**: Add your production URL to Authorized redirect URIs

### Issue 3: "Invalid request" error
**Cause**: Missing or incorrect Client ID/Secret
**Fix**: Verify credentials in both Google Console and your `.env` file

## Testing

1. **Clear browser cookies** for your domain
2. **Try incognito/private mode** to avoid cached OAuth state
3. **Check browser console** for specific error messages
4. **Verify URLs match** exactly (no trailing slashes!)

## Quick Checklist

- [ ] Google Cloud Console has correct redirect URIs
- [ ] Supabase Dashboard has Google provider configured
- [ ] `.env.local` has correct Client ID and Secret
- [ ] `/auth/callback` route exists and handles the callback
- [ ] URLs match exactly (protocol, domain, port, path)
- [ ] No trailing slashes in redirect URIs

## Need Different Ports?

If running on different ports:

```javascript
// Dynamic redirect URL based on environment
const getRedirectUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000/auth/callback'
  }
  return `${window.location.origin}/auth/callback`
}

const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: getRedirectUrl(),
  },
})
```

Remember to add all possible redirect URIs to Google Console!