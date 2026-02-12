/**
 * GitHub OAuth Callback
 * GET - Exchange authorization code for access token, store in user_integrations, trigger initial sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, isAuthError, getUserId } from '@/lib/unified-auth-resolver';
import type { UnifiedSession } from '@/lib/unified-auth-resolver';
import { syncGitHubRepos } from '@/lib/integrations/github-adapter';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Resolve user ID from multiple sources:
 * 1. Try resolveAuthentication (cookies/bearer)
 * 2. Fall back to github_oauth_uid cookie set before redirect
 */
async function resolveUserId(request: NextRequest): Promise<string | null> {
  // Try standard auth first
  const authResult = await resolveAuthentication(request);
  if (!isAuthError(authResult)) {
    const session = authResult as UnifiedSession;
    const uid = getUserId(session);
    if (uid) return uid;
  }

  // Fall back to the cookie set by IntegrationCard before OAuth redirect
  const oauthUid = request.cookies.get('github_oauth_uid')?.value;
  if (oauthUid && /^[0-9a-f-]{36}$/.test(oauthUid)) {
    // Verify this user actually exists
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.auth.admin.getUserById(oauthUid);
    if (data?.user) return oauthUid;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/settings?github_error=access_denied', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?github_error=no_code', request.url));
  }

  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.redirect(new URL('/login?redirect=/settings', request.url));
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return NextResponse.redirect(
        new URL(`/settings?github_error=${tokenData.error}`, request.url)
      );
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const githubUser = await userResponse.json();

    const supabase = getSupabaseAdmin();

    // Upsert integration record
    const { data: integration, error: upsertError } = await supabase
      .from('user_integrations')
      .upsert(
        {
          user_id: userId,
          provider: 'github',
          provider_user_id: githubUser.login,
          access_token: accessToken,
          status: 'active',
          provider_data: {
            avatar_url: githubUser.avatar_url,
            name: githubUser.name,
            bio: githubUser.bio,
            public_repos: githubUser.public_repos,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      )
      .select()
      .single();

    if (upsertError || !integration) {
      return NextResponse.redirect(new URL('/settings?github_error=save_failed', request.url));
    }

    // Trigger initial sync in background (non-blocking)
    syncGitHubRepos(userId, integration.id, accessToken).catch((syncError) => {
      console.error('[GitHub] Initial sync failed:', syncError);
    });

    // Clear the oauth cookie and redirect
    const response = NextResponse.redirect(new URL('/settings?github_connected=true', request.url));
    response.cookies.delete('github_oauth_uid');
    return response;
  } catch (err: any) {
    console.error('[GitHub Callback] Error:', err);
    return NextResponse.redirect(new URL('/settings?github_error=unknown', request.url));
  }
}
