/**
 * GitHub OAuth Callback
 * GET - Exchange authorization code for access token, store in user_integrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, isAuthError, getUserId } from '@/lib/unified-auth-resolver';
import type { UnifiedSession } from '@/lib/unified-auth-resolver';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

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

  const stateParam = searchParams.get('state');
  const desktopState = decodeDesktopState(stateParam);

  if (error) {
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'github', error: 'access_denied' });
      return new NextResponse(desktopCallbackHtml('GitHub', false, 'Access denied'), { status: 400, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(new URL('/settings?github_error=access_denied', request.url));
  }

  if (!code) {
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'github', error: 'no_code' });
      return new NextResponse(desktopCallbackHtml('GitHub', false, 'No authorization code received'), { status: 400, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(new URL('/settings?github_error=no_code', request.url));
  }

  let userId: string | null = null;
  if (desktopState) {
    userId = await validateDesktopUserId(desktopState.u);
    if (!userId) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'github', error: 'invalid_user' });
      return new NextResponse(desktopCallbackHtml('GitHub', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
    }
  } else {
    userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.redirect(new URL('/login?redirect=/settings', request.url));
    }
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
        client_id: process.env.GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'github', error: tokenData.error });
        return new NextResponse(desktopCallbackHtml('GitHub', false, `Token error: ${tokenData.error}`), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
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

    // Check if integration already exists
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'github')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'github' as const,
      provider_user_id: githubUser.login,
      access_token: accessToken,
      status: 'active' as const,
      provider_data: {
        avatar_url: githubUser.avatar_url,
        name: githubUser.name,
        bio: githubUser.bio,
        public_repos: githubUser.public_repos,
      },
      updated_at: new Date().toISOString(),
    };

    const dbResult = existingIntegration
      ? await supabase.from('user_integrations').update(integrationData).eq('id', existingIntegration.id)
      : await supabase.from('user_integrations').insert(integrationData);

    if (dbResult.error) {
      console.error('[GitHub OAuth] Failed to save integration:', dbResult.error);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'github', error: 'db_error' });
        return new NextResponse(desktopCallbackHtml('GitHub', false, 'Failed to save integration'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(new URL('/settings?github_error=db_error', request.url));
    }

    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'github' });
      return new NextResponse(desktopCallbackHtml('GitHub', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the oauth cookie and redirect
    const response = NextResponse.redirect(new URL('/settings?github_connected=true', request.url));
    response.cookies.delete('github_oauth_uid');
    return response;
  } catch (err: any) {
    console.error('[GitHub Callback] Error:', err);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'github', error: 'unknown' });
      return new NextResponse(desktopCallbackHtml('GitHub', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(new URL('/settings?github_error=unknown', request.url));
  }
}
