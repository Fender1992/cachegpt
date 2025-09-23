# Fix Google OAuth with Supabase Auth

## Understanding the Flow

When using Supabase Auth, the OAuth flow is:
1. Your app → Supabase Auth → Google → **Supabase** (not your app) → Your app

The redirect URI that needs to be in Google Console is **Supabase's**, not yours!

## The Correct Fix

### Step 1: Get Your Supabase OAuth Redirect URL

Your Supabase project's OAuth callback URL is:
```
https://slxgfzlralwbpzafbufm.supabase.co/auth/v1/callback
```

This is the URL that must be added to Google Console!

### Step 2: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** > **Credentials**
3. Click on your OAuth 2.0 Client ID
4. In **Authorized redirect URIs**, add this EXACT URL:
   ```
   https://slxgfzlralwbpzafbufm.supabase.co/auth/v1/callback
   ```
5. Click **Save**

### Step 3: Configure Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/slxgfzlralwbpzafbufm)
2. Navigate to **Authentication** > **Providers**
3. Click on **Google** provider
4. Ensure these fields are filled:
   - **Enable Google provider**: ON
   - **Client ID**: Your Google OAuth Client ID (from Google Console)
   - **Client Secret**: Your Google OAuth Client Secret (from Google Console)
5. Click **Save**

### Step 4: Update Site URL in Supabase (Important!)

1. In Supabase Dashboard, go to **Authentication** > **URL Configuration**
2. Set **Site URL** to:
   - For local development: `http://localhost:3000`
   - For production: `https://yourdomain.com`
3. Add to **Redirect URLs** (these are YOUR app URLs):
   ```
   http://localhost:3000/auth/callback
   http://localhost:3001/auth/callback
   https://yourdomain.com/auth/callback
   ```

### Step 5: Verify Your Code

Your auth code should look like this:

```typescript
// components/auth/auth-form.tsx
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`, // This is YOUR app's callback
  },
})
```

## The Key Difference

**Common Mistake**: Adding `http://localhost:3000/auth/callback` to Google Console
**Correct**: Adding `https://slxgfzlralwbpzafbufm.supabase.co/auth/v1/callback` to Google Console

Google redirects to Supabase, then Supabase redirects to your app.

## Quick Debug Checklist

- [ ] Google Console has `https://slxgfzlralwbpzafbufm.supabase.co/auth/v1/callback`
- [ ] Supabase Dashboard has Google Client ID and Secret
- [ ] Supabase URL Configuration has correct Site URL
- [ ] Supabase Redirect URLs includes your app's callback URLs
- [ ] Your `.env.local` has correct Supabase URL and anon key

## Test the Fix

1. Clear browser cookies
2. Try logging in with Google
3. Check browser DevTools Network tab for the actual redirect URL being used

## Alternative: Direct Google OAuth (Without Supabase)

If you want to bypass Supabase and use Google OAuth directly:

```typescript
// Use Google OAuth directly (not through Supabase)
const handleDirectGoogleLogin = () => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const redirectUri = `${window.location.origin}/auth/callback`
  const scope = 'openid email profile'

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `access_type=offline&` +
    `prompt=consent`

  window.location.href = authUrl
}
```

Then you would add `http://localhost:3000/auth/callback` to Google Console.

## Still Not Working?

The error message will show the exact redirect_uri that's being attempted. Check:

1. Browser DevTools → Network tab
2. Find the request to `accounts.google.com`
3. Check the `redirect_uri` parameter
4. Make sure that EXACT URL is in Google Console

Common issues:
- URL has trailing slash in one place but not the other
- Using http vs https
- Different ports (3000 vs 3001)
- Supabase project URL changed