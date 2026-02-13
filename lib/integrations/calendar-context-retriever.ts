/**
 * Google Calendar Context Retriever
 * Fetches relevant calendar events on demand via Google Calendar API
 * No pre-sync or embeddings — queries Calendar live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidCalendarToken } from '@/lib/google-calendar/calendar-token';

const MAX_EVENTS = 15;
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface CalendarEventResult {
  id: string;
  summary: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  attendees: string[];
  organizer: string;
  status: string;
}

interface QueryAnalysis {
  intent: 'check_schedule' | 'check_availability' | 'find_event' | 'general';
  timeRange: {
    timeMin: string;
    timeMax: string;
  };
  searchTerms: string[];
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to understand user intent for Calendar
 */
export function analyzeCalendarQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();

  let intent: QueryAnalysis['intent'] = 'general';

  if (/(?:what(?:'s| is).*(?:on|in).*(?:schedule|calendar|agenda)|my (?:schedule|calendar|agenda|meetings|events)|(?:today|tomorrow|this week)(?:'s)?\s*(?:schedule|calendar|meetings|events))/i.test(query)) {
    intent = 'check_schedule';
  } else if (/(?:am i (?:free|busy|available)|(?:free|busy|available).*(?:at|on|from)|availability|open.*slot|schedule.*(?:free|open))/i.test(query)) {
    intent = 'check_availability';
  } else if (/(?:when is|find|next|upcoming).*(?:meeting|event|appointment|call|standup|sync|1:1|one.on.one)/i.test(query)) {
    intent = 'find_event';
  } else if (/(?:meeting|event|calendar|schedule|appointment|call|standup|sync)/i.test(query)) {
    intent = 'check_schedule';
  }

  // Determine time range based on query
  const now = new Date();
  let timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 1); // Default: today

  if (lowerQuery.includes('tomorrow')) {
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + 1);
  } else if (lowerQuery.includes('this week') || lowerQuery.includes('the week')) {
    const dayOfWeek = now.getDay();
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek));
  } else if (lowerQuery.includes('next week')) {
    const dayOfWeek = now.getDay();
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek));
    timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + 7);
  } else if (lowerQuery.includes('this month')) {
    timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (/(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(query)) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.findIndex(d => lowerQuery.includes(d));
    if (targetDay >= 0) {
      const currentDay = now.getDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
      timeMax = new Date(timeMin);
      timeMax.setDate(timeMax.getDate() + 1);
    }
  } else if (intent === 'find_event') {
    // For "find event" queries, look ahead 14 days
    timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
  }

  // Extract search terms
  const stopWords = new Set([
    'calendar', 'schedule', 'meeting', 'meetings', 'event', 'events',
    'appointment', 'appointments', 'agenda', 'call', 'calls',
    'what', 'when', 'where', 'who', 'is', 'are', 'am', 'was',
    'my', 'i', 'me', 'the', 'a', 'an', 'on', 'at', 'in', 'for',
    'today', 'tomorrow', 'this', 'next', 'week', 'month',
    'free', 'busy', 'available', 'availability', 'open', 'slot',
    'find', 'search', 'show', 'check', 'get', 'list',
    'do', 'does', 'have', 'has', 'had',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);

  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return {
    intent,
    timeRange: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    },
    searchTerms,
  };
}

/**
 * Format calendar events as context
 */
export function formatCalendarContext(events: CalendarEventResult[], analysis: QueryAnalysis): string {
  if (events.length === 0) {
    const timeMin = new Date(analysis.timeRange.timeMin);
    const timeMax = new Date(analysis.timeRange.timeMax);
    return `## Calendar Context\n\nNo events found between ${timeMin.toLocaleDateString()} and ${timeMax.toLocaleDateString()}.`;
  }

  const lines = ['## Calendar Context\n'];

  // Group events by date
  const byDate = new Map<string, CalendarEventResult[]>();
  for (const event of events) {
    const dateKey = event.isAllDay
      ? event.startTime
      : new Date(event.startTime).toLocaleDateString();
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(event);
  }

  for (const [date, dayEvents] of byDate) {
    lines.push(`\n### ${date}\n`);

    for (const event of dayEvents) {
      if (event.isAllDay) {
        lines.push(`- **All Day:** ${event.summary}`);
      } else {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lines.push(`- **${startStr} - ${endStr}:** ${event.summary}`);
      }

      if (event.location) {
        lines.push(`  Location: ${event.location}`);
      }
      if (event.attendees.length > 0) {
        lines.push(`  Attendees: ${event.attendees.slice(0, 5).join(', ')}${event.attendees.length > 5 ? ` (+${event.attendees.length - 5} more)` : ''}`);
      }
      if (event.description) {
        const truncated = event.description.split('\n').slice(0, 3).join('\n');
        lines.push(`  Description: ${truncated}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Main Calendar context retrieval function
 * Fetches events on demand via Google Calendar API
 */
export async function retrieveCalendarContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeCalendarQuery(queryText);

  // Only retrieve context for calendar-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  try {
    const token = await getValidCalendarToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    // Fetch events from Google Calendar API
    const params = new URLSearchParams({
      timeMin: analysis.timeRange.timeMin,
      timeMax: analysis.timeRange.timeMax,
      maxResults: String(MAX_EVENTS),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const eventsRes = await fetch(
      `${CALENDAR_API}/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!eventsRes.ok) {
      console.error('[Calendar Context] Events fetch failed:', eventsRes.status);
      return null;
    }

    const eventsData = await eventsRes.json();
    const items = eventsData.items || [];

    if (items.length === 0 && analysis.intent !== 'check_availability') {
      return null;
    }

    const results: CalendarEventResult[] = items.map((event: any) => ({
      id: event.id,
      summary: event.summary || '(No title)',
      description: event.description || '',
      location: event.location || '',
      startTime: event.start?.dateTime || event.start?.date || '',
      endTime: event.end?.dateTime || event.end?.date || '',
      isAllDay: !!event.start?.date,
      attendees: (event.attendees || []).map((a: any) => a.displayName || a.email),
      organizer: event.organizer?.displayName || event.organizer?.email || '',
      status: event.status || '',
    }));

    // Filter by search terms if specified
    let filtered = results;
    if (analysis.searchTerms.length > 0) {
      filtered = results.filter(event => {
        const text = `${event.summary} ${event.description} ${event.location} ${event.attendees.join(' ')}`.toLowerCase();
        return analysis.searchTerms.some(term => text.includes(term));
      });
      // Fall back to all results if no matches
      if (filtered.length === 0) {
        filtered = results;
      }
    }

    return formatCalendarContext(filtered, analysis);
  } catch (error) {
    console.error('[Calendar Context] Error retrieving context:', error);
    return null;
  }
}
