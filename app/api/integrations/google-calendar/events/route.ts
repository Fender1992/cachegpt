/**
 * Google Calendar Events API
 * GET:    Fetch events with timeMin/timeMax/calendarId params
 * POST:   Create a new event
 * PATCH:  Update an existing event
 * DELETE: Delete an event
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

async function getCalendarToken(req: NextRequest) {
  const authResult = await resolveAuthentication(req);
  if (isAuthError(authResult)) {
    return { error: 'Unauthorized', status: 401 } as const;
  }

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('user_id', authResult.user.id)
    .eq('provider', 'google_calendar')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return { error: 'Google Calendar not connected', status: 404 } as const;
  }

  const token = await getValidCalendarToken(
    integration.id,
    integration.access_token,
    integration.refresh_token,
    integration.token_expires_at
  );

  if (!token) {
    return { error: 'Failed to get valid token', status: 401 } as const;
  }

  return { token } as const;
}

export async function GET(req: NextRequest) {
  try {
    const result = await getCalendarToken(req);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { token } = result;

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

/**
 * POST: Create a new calendar event
 * Body: { summary, description?, location?, start, end, attendees?, calendarId? }
 * start/end: { dateTime: ISO string } or { date: "YYYY-MM-DD" } for all-day
 */
export async function POST(req: NextRequest) {
  try {
    const result = await getCalendarToken(req);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { token } = result;

    const body = await req.json();
    const { summary, description, location, start, end, attendees, calendarId = 'primary' } = body;

    if (!summary || !start || !end) {
      return NextResponse.json(
        { error: 'summary, start, and end are required' },
        { status: 400 }
      );
    }

    const eventBody: Record<string, any> = {
      summary,
      start,
      end,
    };
    if (description) eventBody.description = description;
    if (location) eventBody.location = location;
    if (attendees?.length) {
      eventBody.attendees = attendees.map((email: string) => ({ email }));
    }

    const createRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error('[Calendar Events] Create error:', createRes.status, errorText);
      const errorMsg = createRes.status === 403
        ? 'Permission denied. Please disconnect and reconnect Google Calendar in Settings to grant write permissions.'
        : createRes.status === 401
        ? 'Authentication expired. Please disconnect and reconnect Google Calendar in Settings.'
        : 'Failed to create event';
      return NextResponse.json({ error: errorMsg }, { status: createRes.status });
    }

    const created = await createRes.json();
    return NextResponse.json({
      id: created.id,
      summary: created.summary,
      htmlLink: created.htmlLink,
      start: created.start,
      end: created.end,
    });
  } catch (error) {
    console.error('[Calendar Events] Create error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

/**
 * PATCH: Update an existing calendar event
 * Body: { eventId, summary?, description?, location?, start?, end?, calendarId? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const result = await getCalendarToken(req);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { token } = result;

    const body = await req.json();
    const { eventId, calendarId = 'primary', ...updates } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const patchRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      }
    );

    if (!patchRes.ok) {
      const errorText = await patchRes.text();
      console.error('[Calendar Events] Update error:', patchRes.status, errorText);
      return NextResponse.json({ error: 'Failed to update event' }, { status: patchRes.status });
    }

    const updated = await patchRes.json();
    return NextResponse.json({
      id: updated.id,
      summary: updated.summary,
      htmlLink: updated.htmlLink,
      start: updated.start,
      end: updated.end,
    });
  } catch (error) {
    console.error('[Calendar Events] Update error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

/**
 * DELETE: Delete a calendar event
 * Query params: eventId, calendarId? (defaults to primary)
 */
export async function DELETE(req: NextRequest) {
  try {
    const result = await getCalendarToken(req);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { token } = result;

    const searchParams = req.nextUrl.searchParams;
    const eventId = searchParams.get('eventId');
    const calendarId = searchParams.get('calendarId') || 'primary';

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const deleteRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!deleteRes.ok && deleteRes.status !== 204) {
      const errorText = await deleteRes.text();
      console.error('[Calendar Events] Delete error:', deleteRes.status, errorText);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: deleteRes.status });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[Calendar Events] Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
