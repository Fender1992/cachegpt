/**
 * Slack OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

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
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: error });
        return new NextResponse(desktopCallbackHtml('Slack', false, error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?slack_error=${error}`, req.url)
      );
    }

    if (!code) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: 'no_code' });
        return new NextResponse(desktopCallbackHtml('Slack', false, 'No authorization code'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?slack_error=no_code', req.url)
      );
    }

    // Get user ID — desktop uses state param, web uses cookie
    let userId: string | null = null;
    if (desktopState) {
      userId = await validateDesktopUserId(desktopState.u);
      if (!userId) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: 'invalid_user' });
        return new NextResponse(desktopCallbackHtml('Slack', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
    } else {
      const cookieStore = await cookies();
      userId = cookieStore.get('slack_oauth_uid')?.value || null;
      if (!userId) {
        return NextResponse.redirect(
          new URL('/settings?slack_error=no_user', req.url)
        );
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/slack/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Slack OAuth] Token exchange failed:', errorData);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: 'token_exchange_failed' });
        return new NextResponse(desktopCallbackHtml('Slack', false, 'Token exchange failed'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?slack_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error('[Slack OAuth] Token response error:', tokenData.error);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: tokenData.error });
        return new NextResponse(desktopCallbackHtml('Slack', false, tokenData.error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?slack_error=${tokenData.error}`, req.url)
      );
    }

    const accessToken = tokenData.access_token;
    const teamName = tokenData.team?.name || '';
    const teamId = tokenData.team?.id || '';
    const authedUserId = tokenData.authed_user?.id || '';
    const scope = tokenData.scope || '';

    // Get user info
    const userInfoRes = await fetch('https://slack.com/api/users.info', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ user: authedUserId }),
    });

    const userInfo = userInfoRes.ok ? await userInfoRes.json() : { ok: false };
    const userName = userInfo.ok ? (userInfo.user?.real_name || userInfo.user?.name || '') : '';

    // Get channel count
    const channelsRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const channelsData = channelsRes.ok ? await channelsRes.json() : { ok: false };

    // Slack tokens don't expire by default (unless token rotation is enabled)
    // Set a far-future expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setFullYear(tokenExpiresAt.getFullYear() + 10);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'slack',
      provider_user_id: authedUserId,
      access_token: accessToken,
      refresh_token: tokenData.refresh_token || null,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        team_name: teamName,
        team_id: teamId,
        user_name: userName,
        user_id: authedUserId,
        channel_count: channelsData.ok ? (channelsData.response_metadata?.total_count || 0) : 0,
        scope: scope.split(','),
      },
      status: 'active',
      last_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const dbResult = existingIntegration
      ? await supabase.from('user_integrations').update(integrationData).eq('id', existingIntegration.id)
      : await supabase.from('user_integrations').insert(integrationData);

    if (dbResult.error) {
      console.error('[Slack OAuth] Failed to save integration:', dbResult.error);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: 'db_error' });
        return new NextResponse(desktopCallbackHtml('Slack', false, 'Failed to save integration'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(new URL('/settings?slack_error=db_error', req.url));
    }

    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'slack' });
      return new NextResponse(desktopCallbackHtml('Slack', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the cookie
    const response = NextResponse.redirect(
      new URL('/settings?slack_connected=true', req.url)
    );
    response.cookies.delete('slack_oauth_uid');

    return response;
  } catch (error) {
    console.error('[Slack OAuth Callback] Error:', error);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'slack', error: 'unexpected' });
      return new NextResponse(desktopCallbackHtml('Slack', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(
      new URL('/settings?slack_error=unexpected', req.url)
    );
  }
}
