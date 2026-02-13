/**
 * Google Calendar Events API
 * GET: Fetch events with timeMin/timeMax/calendarId params
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidCalendarToken } from '@/lib/google-calendar/calendar-token';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

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

    const searchParams = req.nextUrl.searchParams;
    const calendarId = searchParams.get('calendarId') || 'primary';
    const timeMin = searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = searchParams.get('timeMax') || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    })();
    const maxResults = searchParams.get('maxResults') || '50';

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults,
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const eventsRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!eventsRes.ok) {
      const errorText = await eventsRes.text();
      console.error('[Calendar Events] API error:', eventsRes.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: eventsRes.status });
    }

    const eventsData = await eventsRes.json();

    const events = (eventsData.items || []).map((event: any) => ({
      id: event.id,
      summary: event.summary || '(No title)',
      description: event.description || '',
      location: event.location || '',
      start: event.start,
      end: event.end,
      status: event.status,
      htmlLink: event.htmlLink,
      attendees: (event.attendees || []).map((a: any) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
        self: a.self,
      })),
      organizer: event.organizer ? {
        email: event.organizer.email,
        displayName: event.organizer.displayName,
        self: event.organizer.self,
      } : null,
      isAllDay: !!event.start?.date,
      recurringEventId: event.recurringEventId,
    }));

    return NextResponse.json({ events, nextPageToken: eventsData.nextPageToken });
  } catch (error) {
    console.error('[Calendar Events] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}
