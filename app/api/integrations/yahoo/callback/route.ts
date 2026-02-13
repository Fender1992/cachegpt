/**
 * Yahoo OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration.
 * Yahoo uses Basic Auth for token exchange and OIDC userinfo for profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ImapFlow } from 'imapflow';

const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings?yahoo_error=${error}`, req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings?yahoo_error=no_code', req.url)
      );
    }

    // Get user ID from cookie
    const cookieStore = await cookies();
    const userId = cookieStore.get('yahoo_oauth_uid')?.value;

    if (!userId) {
      return NextResponse.redirect(
        new URL('/settings?yahoo_error=no_user', req.url)
      );
    }

    // Exchange code for access token (Yahoo uses Basic Auth)
    const basicAuth = Buffer.from(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`).toString('base64');

    const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/yahoo/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Yahoo OAuth] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/settings?yahoo_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Get Yahoo user profile via OIDC userinfo
    const profileResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileResponse.ok) {
      return NextResponse.redirect(
        new URL('/settings?yahoo_error=profile_fetch_failed', req.url)
      );
    }

    const profile = await profileResponse.json();
    const email = profile.email;

    // Get folder count via IMAP
    let folderCount = 0;
    try {
      const client = new ImapFlow({
        host: 'imap.mail.yahoo.com',
        port: 993,
        secure: true,
        auth: { user: email, accessToken: access_token },
        logger: false,
      });
      await client.connect();
      const mailboxes = await client.list();
      folderCount = mailboxes.length;
      await client.logout();
    } catch (imapError) {
      console.warn('[Yahoo OAuth] IMAP folder count failed:', imapError);
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expires_in);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'yahoo')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'yahoo',
      provider_user_id: email,
      access_token,
      refresh_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        email,
        name: profile.name || profile.given_name || '',
        label_count: folderCount,
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

    // Clear the cookie
    const response = NextResponse.redirect(
      new URL('/settings?yahoo_connected=true', req.url)
    );
    response.cookies.delete('yahoo_oauth_uid');

    return response;
  } catch (error) {
    console.error('[Yahoo OAuth Callback] Error:', error);
    return NextResponse.redirect(
      new URL('/settings?yahoo_error=unexpected', req.url)
    );
  }
}
