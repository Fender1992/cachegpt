/**
 * Jira OAuth Callback Handler
 * Exchanges authorization code for access token, discovers cloudId, creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID!;
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET!;

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

    const stateParam = searchParams.get('state');
    desktopState = decodeDesktopState(stateParam);

    if (error) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error });
        return new NextResponse(desktopCallbackHtml('Jira', false, error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?jira_error=${error}`, req.url)
      );
    }

    if (!code) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'no_code' });
        return new NextResponse(desktopCallbackHtml('Jira', false, 'No authorization code'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?jira_error=no_code', req.url)
      );
    }

    // Get user ID from desktop state or cookie
    let userId: string | null = null;
    if (desktopState) {
      userId = await validateDesktopUserId(desktopState.u);
      if (!userId) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'invalid_user' });
        return new NextResponse(desktopCallbackHtml('Jira', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
    } else {
      const cookieStore = await cookies();
      userId = cookieStore.get('jira_oauth_uid')?.value || null;
      if (!userId) {
        return NextResponse.redirect(
          new URL('/settings?jira_error=no_user', req.url)
        );
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: JIRA_CLIENT_ID,
        client_secret: JIRA_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/jira/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Jira OAuth] Token exchange failed:', errorData);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'token_exchange_failed' });
        return new NextResponse(desktopCallbackHtml('Jira', false, 'Token exchange failed'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?jira_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Get accessible resources (to find cloudId)
    const resourcesResponse = await fetch(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!resourcesResponse.ok) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'resources_fetch_failed' });
        return new NextResponse(desktopCallbackHtml('Jira', false, 'Failed to fetch resources'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?jira_error=resources_fetch_failed', req.url)
      );
    }

    const resources = await resourcesResponse.json();

    if (!resources || resources.length === 0) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'no_sites' });
        return new NextResponse(desktopCallbackHtml('Jira', false, 'No Jira sites found'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?jira_error=no_sites', req.url)
      );
    }

    // Use the first accessible site
    const site = resources[0];
    const cloudId = site.id;

    // Get user info from Jira
    const userResponse = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    let userEmail = '';
    let displayName = '';
    if (userResponse.ok) {
      const userData = await userResponse.json();
      userEmail = userData.emailAddress || '';
      displayName = userData.displayName || '';
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expires_in);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'jira')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'jira',
      provider_user_id: userEmail,
      access_token,
      refresh_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        email: userEmail,
        display_name: displayName,
        cloud_id: cloudId,
        site_name: site.name || '',
        site_url: site.url || '',
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
      console.error('[Jira OAuth] Failed to save integration:', dbResult.error);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'db_error' });
        return new NextResponse(desktopCallbackHtml('Jira', false, 'Failed to save integration'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(new URL('/settings?jira_error=db_error', req.url));
    }

    // Desktop: post success result and return HTML
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'jira' });
      return new NextResponse(desktopCallbackHtml('Jira', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the cookie
    const response = NextResponse.redirect(
      new URL('/settings?jira_connected=true', req.url)
    );
    response.cookies.delete('jira_oauth_uid');
    return response;
  } catch (error) {
    console.error('[Jira OAuth Callback] Error:', error);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'jira', error: 'unexpected' });
      return new NextResponse(desktopCallbackHtml('Jira', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(
      new URL('/settings?jira_error=unexpected', req.url)
    );
  }
}
