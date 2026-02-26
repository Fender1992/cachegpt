/**
 * Teams OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

const TEAMS_CLIENT_ID = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID!;
const TEAMS_CLIENT_SECRET = process.env.TEAMS_CLIENT_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  let desktopState: ReturnType<typeof decodeDesktopState> = null;

  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Check for desktop OAuth state
    const stateParam = searchParams.get('state');
    desktopState = decodeDesktopState(stateParam);

    if (error) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'teams', error: error });
        return new NextResponse(desktopCallbackHtml('Microsoft Teams', false, error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?teams_error=${error}`, req.url)
      );
    }

    if (!code) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'teams', error: 'no_code' });
        return new NextResponse(desktopCallbackHtml('Microsoft Teams', false, 'No authorization code'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?teams_error=no_code', req.url)
      );
    }

    // Get user ID — desktop uses state param, web uses cookie
    let userId: string | null = null;
    if (desktopState) {
      userId = await validateDesktopUserId(desktopState.u);
      if (!userId) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'teams', error: 'invalid_user' });
        return new NextResponse(desktopCallbackHtml('Microsoft Teams', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
    } else {
      const cookieStore = await cookies();
      userId = cookieStore.get('teams_oauth_uid')?.value || null;
      if (!userId) {
        return NextResponse.redirect(new URL('/settings?teams_error=no_user', req.url));
      }
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/teams/callback`;

    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: TEAMS_CLIENT_ID,
          client_secret: TEAMS_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'User.Read Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Chat.Read ChatMessage.Send offline_access',
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Teams OAuth] Token exchange failed:', errorData);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'teams', error: 'token_exchange_failed' });
        return new NextResponse(desktopCallbackHtml('Microsoft Teams', false, 'Token exchange failed'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?teams_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[Teams OAuth] Token response error:', tokenData.error);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'teams', error: tokenData.error });
        return new NextResponse(desktopCallbackHtml('Microsoft Teams', false, tokenData.error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?teams_error=${tokenData.error}`, req.url)
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 3600;
    const scope = tokenData.scope || '';

    // Get user profile from Microsoft Graph
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profile = profileRes.ok ? await profileRes.json() : {};
    const userName = profile.displayName || profile.userPrincipalName || '';
    const userEmail = profile.mail || profile.userPrincipalName || '';
    const providerUserId = profile.id || '';

    // Get joined teams count
    let teamCount = 0;
    try {
      const teamsRes = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        teamCount = teamsData.value?.length || 0;
      }
    } catch {
      // Non-critical, proceed without team count
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresIn);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'teams')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'teams',
      provider_user_id: providerUserId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        organization_name: profile.companyName || '',
        user_name: userName,
        user_email: userEmail,
        team_count: teamCount,
        scope: scope.split(' '),
      },
      status: 'active',
      last_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingIntegration) {
      await supabase
        .from('user_integrations')
        .update(integrationData)
        .eq('id', existingIntegration.id);
    } else {
      await supabase
        .from('user_integrations')
        .insert(integrationData);
    }

    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'teams' });
      return new NextResponse(desktopCallbackHtml('Microsoft Teams', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the cookie
    const response = NextResponse.redirect(new URL('/settings?teams_connected=true', req.url));
    response.cookies.delete('teams_oauth_uid');
    return response;
  } catch (error) {
    console.error('[Teams OAuth Callback] Error:', error);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'teams', error: 'unexpected' });
      return new NextResponse(desktopCallbackHtml('Microsoft Teams', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(
      new URL('/settings?teams_error=unexpected', req.url)
    );
  }
}
