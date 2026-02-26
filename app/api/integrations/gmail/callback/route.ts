/**
 * Gmail OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

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
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error });
        return new NextResponse(desktopCallbackHtml('Gmail', false, error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?gmail_error=${error}`, req.url)
      );
    }

    if (!code) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error: 'no_code' });
        return new NextResponse(desktopCallbackHtml('Gmail', false, 'No code received'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?gmail_error=no_code', req.url)
      );
    }

    // Get user ID
    let userId: string | null = null;
    if (desktopState) {
      userId = await validateDesktopUserId(desktopState.u);
      if (!userId) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error: 'invalid_user' });
        return new NextResponse(desktopCallbackHtml('Gmail', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
    } else {
      const cookieStore = await cookies();
      userId = cookieStore.get('gmail_oauth_uid')?.value || null;
      if (!userId) {
        return NextResponse.redirect(new URL('/settings?gmail_error=no_user', req.url));
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/gmail/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Gmail OAuth] Token exchange failed:', errorData);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error: 'token_exchange_failed' });
        return new NextResponse(desktopCallbackHtml('Gmail', false, 'Token exchange failed'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?gmail_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Get Gmail user profile
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileResponse.ok) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error: 'profile_fetch_failed' });
        return new NextResponse(desktopCallbackHtml('Gmail', false, 'Profile fetch failed'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?gmail_error=profile_fetch_failed', req.url)
      );
    }

    const profile = await profileResponse.json();

    // Get label count
    const labelsResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const labels = labelsResponse.ok ? await labelsResponse.json() : { labels: [] };

    // Calculate token expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expires_in);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'gmail',
      provider_user_id: profile.emailAddress,
      access_token,
      refresh_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        email: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal,
        historyId: profile.historyId,
        scope: scope ? scope.split(' ') : [],
        label_count: labels.labels?.length || 0,
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
      console.error('[Gmail OAuth] Failed to save integration:', dbResult.error);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error: 'db_error' });
        return new NextResponse(desktopCallbackHtml('Gmail', false, 'Failed to save integration'), { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(new URL('/settings?gmail_error=db_error', req.url));
    }

    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'gmail' });
      return new NextResponse(desktopCallbackHtml('Gmail', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the cookie
    const response = NextResponse.redirect(
      new URL('/settings?gmail_connected=true', req.url)
    );
    response.cookies.delete('gmail_oauth_uid');

    return response;
  } catch (error) {
    console.error('[Gmail OAuth Callback] Error:', error);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'gmail', error: 'unexpected' });
      return new NextResponse(desktopCallbackHtml('Gmail', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(
      new URL('/settings?gmail_error=unexpected', req.url)
    );
  }
}
