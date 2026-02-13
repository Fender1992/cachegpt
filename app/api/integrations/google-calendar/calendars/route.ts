/**
 * Google Calendar List API
 * GET: Fetch user's calendar list
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidCalendarToken } from '@/lib/google-calendar/calendar-token';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'google_calendar')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 });
    }

    const token = await getValidCalendarToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const calendarListRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!calendarListRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch calendars' }, { status: calendarListRes.status });
    }

    const calendarListData = await calendarListRes.json();

    const calendars = (calendarListData.items || []).map((cal: any) => ({
      id: cal.id,
      summary: cal.summary || cal.id,
      description: cal.description || '',
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
      accessRole: cal.accessRole,
      selected: cal.selected,
    }));

    return NextResponse.json(calendars);
  } catch (error) {
    console.error('[Calendar List] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar list' },
      { status: 500 }
    );
  }
}
