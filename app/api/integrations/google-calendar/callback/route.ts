/**
 * Google Calendar OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

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
        new URL(`/settings?calendar_error=${error}`, req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings?calendar_error=no_code', req.url)
      );
    }

    // Get user ID from cookie
    const cookieStore = await cookies();
    const userId = cookieStore.get('calendar_oauth_uid')?.value;

    if (!userId) {
      return NextResponse.redirect(
        new URL('/settings?calendar_error=no_user', req.url)
      );
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
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/google-calendar/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Calendar OAuth] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/settings?calendar_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Warn if write scope wasn't granted (user may have unchecked it)
    const grantedScopes = scope ? scope.split(' ') : [];
    const hasWriteScope = grantedScopes.some((s: string) =>
      s === 'https://www.googleapis.com/auth/calendar' ||
      s === 'https://www.googleapis.com/auth/calendar.events'
    );
    if (!hasWriteScope) {
      console.warn('[Calendar OAuth] WARNING: Write scope not granted! User will not be able to create events. Granted:', scope);
    }

    // Get user email via userinfo
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userinfoResponse.ok) {
      return NextResponse.redirect(
        new URL('/settings?calendar_error=profile_fetch_failed', req.url)
      );
    }

    const userinfo = await userinfoResponse.json();

    // Get calendar list
    const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const calendars = calendarsResponse.ok ? await calendarsResponse.json() : { items: [] };

    // Calculate token expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expires_in);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'google_calendar',
      provider_user_id: userinfo.email,
      access_token,
      refresh_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        email: userinfo.email,
        calendar_count: calendars.items?.length || 0,
        primary_calendar: calendars.items?.find((c: any) => c.primary)?.id || 'primary',
        scope: scope ? scope.split(' ') : [],
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
      new URL('/settings?calendar_connected=true', req.url)
    );
    response.cookies.delete('calendar_oauth_uid');

    return response;
  } catch (error) {
    console.error('[Calendar OAuth Callback] Error:', error);
    return NextResponse.redirect(
      new URL('/settings?calendar_error=unexpected', req.url)
    );
  }
}
