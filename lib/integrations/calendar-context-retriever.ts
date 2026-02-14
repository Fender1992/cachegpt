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
  intent: 'check_schedule' | 'check_availability' | 'find_event' | 'create_event' | 'delete_event' | 'general';
  timeRange: {
    timeMin: string;
    timeMax: string;
  };
  searchTerms: string[];
  // Parsed event details for create intents
  parsedEvent?: {
    summary: string;
    date: string;      // ISO date string
    startTime?: string; // HH:MM
    endTime?: string;   // HH:MM
    location?: string;
    isAllDay: boolean;
  };
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Parse event details from natural language query
 */
function parseEventFromQuery(query: string): QueryAnalysis['parsedEvent'] | undefined {
  const now = new Date();
  let eventDate: Date | null = null;

  // Month + day: "feb 19th", "february 19", "march 5"
  const monthDayRegex = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const monthDayMatch = query.match(monthDayRegex);

  if (monthDayMatch) {
    const abbrs = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const day = parseInt(monthDayMatch[2]);
    const monthIdx = abbrs.findIndex(a => monthDayMatch[1].toLowerCase().startsWith(a));
    if (monthIdx >= 0 && day >= 1 && day <= 31) {
      eventDate = new Date(now.getFullYear(), monthIdx, day);
      if (eventDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        eventDate.setFullYear(eventDate.getFullYear() + 1);
      }
    }
  }

  if (!eventDate && /\btomorrow\b/i.test(query)) {
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }
  if (!eventDate && /\btoday\b/i.test(query)) {
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (!eventDate) {
    const dayMatch = query.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayMatch) {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const targetDay = days.indexOf(dayMatch[1].toLowerCase());
      let daysAhead = targetDay - now.getDay();
      if (daysAhead <= 0) daysAhead += 7;
      if (/\bnext\s+/i.test(query.slice(Math.max(0, query.indexOf(dayMatch[0]) - 5)))) daysAhead += 7;
      eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
    }
  }
  // "in X days"
  if (!eventDate) {
    const inDaysMatch = query.match(/\bin\s+(\d+)\s+days?\b/i);
    if (inDaysMatch) {
      eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + parseInt(inDaysMatch[1]));
    }
  }
  // "next week" (defaults to next Monday)
  if (!eventDate && /\bnext\s+week\b/i.test(query)) {
    const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
    eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday);
  }
  // MM/DD or MM-DD format: "2/19", "02-19"
  if (!eventDate) {
    const slashDateMatch = query.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (slashDateMatch) {
      const month = parseInt(slashDateMatch[1]) - 1;
      const day = parseInt(slashDateMatch[2]);
      const year = slashDateMatch[3] ? (slashDateMatch[3].length === 2 ? 2000 + parseInt(slashDateMatch[3]) : parseInt(slashDateMatch[3])) : now.getFullYear();
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        eventDate = new Date(year, month, day);
        if (eventDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          eventDate.setFullYear(eventDate.getFullYear() + 1);
        }
      }
    }
  }

  if (!eventDate) return undefined;

  // Time extraction
  let startTime: string | undefined;
  let endTime: string | undefined;
  let isAllDay = true;

  // "from X to Y" pattern (more specific, check first)
  const fromToMatch = query.match(/\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (fromToMatch) {
    let sH = parseInt(fromToMatch[1]);
    const sM = fromToMatch[2] ? parseInt(fromToMatch[2]) : 0;
    let eH = parseInt(fromToMatch[4]);
    const eM = fromToMatch[5] ? parseInt(fromToMatch[5]) : 0;
    const sAmPm = (fromToMatch[3] || fromToMatch[6]).toLowerCase();
    const eAmPm = fromToMatch[6].toLowerCase();
    if (sAmPm === 'pm' && sH < 12) sH += 12;
    if (sAmPm === 'am' && sH === 12) sH = 0;
    if (eAmPm === 'pm' && eH < 12) eH += 12;
    if (eAmPm === 'am' && eH === 12) eH = 0;
    startTime = `${String(sH).padStart(2,'0')}:${String(sM).padStart(2,'0')}`;
    endTime = `${String(eH).padStart(2,'0')}:${String(eM).padStart(2,'0')}`;
    isAllDay = false;
  }

  if (!startTime) {
    // "at 3 pm", "at 3:30 pm"
    const atMatch = query.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (atMatch) {
      let h = parseInt(atMatch[1]);
      const m = atMatch[2] ? parseInt(atMatch[2]) : 0;
      if (atMatch[3].toLowerCase() === 'pm' && h < 12) h += 12;
      if (atMatch[3].toLowerCase() === 'am' && h === 12) h = 0;
      startTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      endTime = `${String(h + 1).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      isAllDay = false;
    }
    // "at noon"
    if (!startTime && /\bat\s+noon\b/i.test(query)) {
      startTime = '12:00';
      endTime = '13:00';
      isAllDay = false;
    }
    // "at midnight"
    if (!startTime && /\bat\s+midnight\b/i.test(query)) {
      startTime = '00:00';
      endTime = '01:00';
      isAllDay = false;
    }
    // "in the morning" / "in the afternoon" / "in the evening"
    if (!startTime && /\bin\s+the\s+morning\b/i.test(query)) {
      startTime = '09:00';
      endTime = '10:00';
      isAllDay = false;
    }
    if (!startTime && /\bin\s+the\s+afternoon\b/i.test(query)) {
      startTime = '14:00';
      endTime = '15:00';
      isAllDay = false;
    }
    if (!startTime && /\bin\s+the\s+evening\b/i.test(query)) {
      startTime = '18:00';
      endTime = '19:00';
      isAllDay = false;
    }
  }

  // Location extraction: "at the [location]" before time/date phrases
  // Match "at the X" or "at X" where X is a multi-word location (not a time like "at 3 pm")
  let location: string | undefined;
  const locationMatch = query.match(/\bat\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s+(?:at|from|on)\s+\d|\s*$)/);
  if (locationMatch) {
    location = locationMatch[1].trim();
  }
  // Also try "in [Location]" pattern (e.g., "in Belton VA", "in Dallas")
  if (!location) {
    const inLocationMatch = query.match(/\bin\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:at|from|on)\s+\d|\s*$)/);
    if (inLocationMatch) {
      location = inLocationMatch[1].trim();
    }
  }

  // Summary extraction - strip date/time/action words, keep the event name
  let summary = query
    .replace(/\b(?:add|create|schedule|book|put|set\s*up|make|plan|arrange|block\s*(?:off|out)?|remind\s+me\s+(?:to|about)|i\s+have|i\s+need\s+to|i(?:'ve| have)\s+got)\b/gi, '')
    // Strip extracted location from summary to avoid duplication
    .replace(location ? new RegExp(`\\b(?:at\\s+(?:the\\s+)?)?${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi') : /(?!)/, '')
    .replace(/\b(?:to\s+)?(?:my\s+)?(?:google\s+)?cal(?:endar|ender)?\b/gi, '')
    .replace(/\b(?:to\s+)?(?:my\s+)?schedule\b/gi, '')
    .replace(monthDayRegex, '')
    .replace(/\b(?:today|tomorrow)\b/gi, '')
    .replace(/\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\bfrom\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\bat\s+(?:noon|midnight)\b/gi, '')
    .replace(/\bin\s+the\s+(?:morning|afternoon|evening)\b/gi, '')
    .replace(/\bin\s+\d+\s+days?\b/gi, '')
    .replace(/\bnext\s+week\b/gi, '')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, '')
    .replace(/\b(?:it|on|at|in|for|the|a|an|my|is|to)\b/gi, '')
    .replace(/[.,!?]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (summary) {
    summary = summary.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  } else {
    summary = 'New Event';
  }

  return {
    summary,
    date: eventDate.toISOString().split('T')[0],
    startTime,
    endTime,
    location,
    isAllDay,
  };
}

/**
 * Analyze query to understand user intent for Calendar
 */
export function analyzeCalendarQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();

  let intent: QueryAnalysis['intent'] = 'general';

  // Write intents (check first — most specific)
  if (
    // Direct action + calendar noun: "add a meeting to my calendar", "create an event", "schedule an appointment"
    /(?:add|create|schedule|book|put|set\s*up|make|plan|arrange|block\s*(?:off|out)?)\b.*(?:calendar|calender|event|appointment|meeting|reminder)/i.test(query) ||
    // "I have a [thing]... add/put on calendar"
    /(?:i\s+have\s+(?:a|an)\s+\w).*(?:add|put|calendar|calender)/i.test(query) ||
    // Action + time reference: "schedule lunch on friday", "book something at 3pm tomorrow"
    /(?:add|create|schedule|book|put|set\s*up|make|plan|arrange|block)\b.+\b(?:on|at|from|for)\b.+\b(?:tomorrow|today|(?:next\s+)?(?:mon|tue|wed|thu|fri|sat|sun)\w*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d|noon|\d{1,2}\s*(?:am|pm))/i.test(query) ||
    // "remind me to..." or "put ... on my calendar"
    /(?:remind\s+me\s+(?:to|about))\b.+\b(?:on|at|tomorrow|today|(?:next\s+)?(?:mon|tue|wed|thu|fri|sat|sun)\w*)/i.test(query) ||
    /\bput\b.+\b(?:on|in)\s+(?:my\s+)?(?:calendar|calender|schedule)\b/i.test(query) ||
    // "I need to [verb] on [date]" pattern
    /\b(?:i\s+need\s+to|i(?:'ve| have)\s+got)\b.+\b(?:on|at)\b.+\b(?:tomorrow|today|(?:next\s+)?(?:mon|tue|wed|thu|fri|sat|sun)\w*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d)/i.test(query) ||
    // "block off/out [time]"
    /\bblock\s*(?:off|out)\b.+\b(?:tomorrow|today|(?:next\s+)?(?:mon|tue|wed|thu|fri|sat|sun)\w*|\d{1,2}\s*(?:am|pm))/i.test(query)
  ) {
    intent = 'create_event';
  } else if (/(?:delete|remove|cancel|take\s*off)\b.*(?:event|appointment|meeting|calendar|calender)/i.test(query)) {
    intent = 'delete_event';
  // Read intents
  } else if (/(?:what(?:'s| is).*(?:on|in).*(?:schedule|calendar|agenda)|my (?:schedule|calendar|agenda|meetings|events)|(?:today|tomorrow|this week)(?:'s)?\s*(?:schedule|calendar|meetings|events))/i.test(query)) {
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
    'add', 'create', 'schedule', 'book', 'put', 'make', 'set',
    'delete', 'remove', 'cancel',
    'do', 'does', 'have', 'has', 'had',
    'google', 'calender',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);

  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Parse event details for create intent
  let parsedEvent: QueryAnalysis['parsedEvent'] | undefined;
  if (intent === 'create_event') {
    parsedEvent = parseEventFromQuery(query);
  }

  return {
    intent,
    timeRange: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    },
    searchTerms,
    parsedEvent,
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
 * Create a calendar event via Google Calendar API (server-side)
 */
async function createCalendarEvent(
  token: string,
  parsedEvent: NonNullable<QueryAnalysis['parsedEvent']>,
  userTimezone?: string
): Promise<string> {
  const eventBody: Record<string, any> = {
    summary: parsedEvent.summary,
  };

  // Resolve timezone: use user's timezone, or fetch from calendar settings
  let timeZone = userTimezone;
  if (!timeZone) {
    try {
      const calRes = await fetch(`${CALENDAR_API}/calendars/primary`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (calRes.ok) {
        const calData = await calRes.json();
        timeZone = calData.timeZone;
      }
    } catch {
      // Fall back to no explicit timezone (calendar default)
    }
  }

  if (parsedEvent.isAllDay) {
    eventBody.start = { date: parsedEvent.date };
    // All-day events: end date is exclusive (next day)
    const endDate = new Date(parsedEvent.date + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    eventBody.end = { date: endDate.toISOString().split('T')[0] };
  } else {
    const startObj: Record<string, string> = { dateTime: `${parsedEvent.date}T${parsedEvent.startTime}:00` };
    const endObj: Record<string, string> = { dateTime: `${parsedEvent.date}T${parsedEvent.endTime}:00` };
    if (timeZone) {
      startObj.timeZone = timeZone;
      endObj.timeZone = timeZone;
    }
    eventBody.start = startObj;
    eventBody.end = endObj;
  }

  if (parsedEvent.location) {
    eventBody.location = parsedEvent.location;
  }

  console.log('[Calendar Action] Creating event:', JSON.stringify({ summary: parsedEvent.summary, date: parsedEvent.date, startTime: parsedEvent.startTime, endTime: parsedEvent.endTime, isAllDay: parsedEvent.isAllDay, timeZone }));

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Calendar Action] Create failed:', res.status, errorText, 'Request body:', JSON.stringify(eventBody));
    if (res.status === 403) {
      return `## Calendar Action\n\nFailed to create event "${parsedEvent.summary}" — permission denied (403). The Google Calendar token does not have write permissions.\n\nTell the user: "Your Google Calendar is connected with **read-only** permissions. To fix this, go to **Settings**, **disconnect** Google Calendar, then **reconnect** it. Google will prompt you to grant write access. After that, try again and I'll create the event for you."`;
    }
    if (res.status === 401) {
      return `## Calendar Action\n\nFailed to create event "${parsedEvent.summary}" — authentication expired (401). Tell the user to go to **Settings**, **disconnect** Google Calendar, and **reconnect** it to refresh their authentication.`;
    }
    return `## Calendar Action\n\nFailed to create event "${parsedEvent.summary}". Error: ${res.status}. Ask the user to try again or check their calendar connection in Settings.`;
  }

  const created = await res.json();
  const dateObj = new Date(parsedEvent.date + 'T00:00:00');
  const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = parsedEvent.isAllDay
    ? 'All day'
    : `${parsedEvent.startTime}${parsedEvent.endTime ? ' - ' + parsedEvent.endTime : ''}`;

  return `## Calendar Action\n\nSuccessfully created event on user's Google Calendar:\n- **Event:** ${created.summary}\n- **Date:** ${dateStr}\n- **Time:** ${timeStr}\n- **Link:** ${created.htmlLink || 'N/A'}\n\nConfirm this to the user in a friendly way.`;
}

/**
 * Delete a matching calendar event via Google Calendar API (server-side)
 */
async function deleteCalendarEvent(
  token: string,
  analysis: QueryAnalysis
): Promise<string> {
  // Fetch events in the time range to find a match
  const params = new URLSearchParams({
    timeMin: analysis.timeRange.timeMin,
    timeMax: analysis.timeRange.timeMax,
    maxResults: '10',
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
    return '## Calendar Action\n\nFailed to search for events to delete.';
  }

  const eventsData = await eventsRes.json();
  const items = eventsData.items || [];

  if (items.length === 0) {
    return '## Calendar Action\n\nNo events found in the specified time range to delete.';
  }

  // Find best matching event by search terms
  let target = items[0];
  if (analysis.searchTerms.length > 0) {
    const scored = items.map((event: any) => {
      const text = `${event.summary || ''} ${event.description || ''}`.toLowerCase();
      const score = analysis.searchTerms.filter((t: string) => text.includes(t)).length;
      return { event, score };
    });
    scored.sort((a: any, b: any) => b.score - a.score);
    target = scored[0].event;
  }

  // Delete the event
  const deleteRes = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(target.id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!deleteRes.ok && deleteRes.status !== 204) {
    return `## Calendar Action\n\nFailed to delete event "${target.summary || 'Unknown'}". Error: ${deleteRes.status}`;
  }

  return `## Calendar Action\n\nSuccessfully deleted event from user's Google Calendar:\n- **Event:** ${target.summary || '(No title)'}\n\nConfirm this to the user in a friendly way.`;
}

/**
 * Main Calendar context retrieval function
 * Fetches events on demand via Google Calendar API
 */
export async function retrieveCalendarContext(
  userId: string,
  queryText: string,
  userTimezone?: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at, provider_data')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeCalendarQuery(queryText);
  console.log('[Calendar Context] Query analysis:', { intent: analysis.intent, hasEvent: !!analysis.parsedEvent, searchTerms: analysis.searchTerms });

  // Only retrieve context for calendar-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  // Pre-flight scope check for write operations
  // Only block if we have stored scopes AND they explicitly show read-only (no write scope)
  // If scopes are missing/empty, let the request through — the 403 handler will catch it
  const isWriteAction = analysis.intent === 'create_event' || analysis.intent === 'delete_event';
  if (isWriteAction && integration.provider_data?.scope) {
    const scopes: string[] = integration.provider_data.scope;
    if (scopes.length > 0) {
      const hasWriteScope = scopes.some((s: string) =>
        s.includes('/auth/calendar') && !s.includes('readonly')
      );
      if (!hasWriteScope) {
        console.warn('[Calendar Context] Token missing write scope. Stored scopes:', scopes);
        return `## Calendar Action\n\nYour Google Calendar connection only has read-only permissions. To create or modify events, you need to reconnect with write access.\n\nPlease go to **Settings**, click **Disconnect** on Google Calendar, then click **Connect** again. Google will ask you to approve calendar write access. After reconnecting, try your request again.`;
      }
    }
  }

  try {
    const token = await getValidCalendarToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      console.error('[Calendar Context] Failed to get valid token for user:', userId);
      return null;
    }

    // Handle write intents (create/delete events)
    if (analysis.intent === 'create_event') {
      console.log('[Calendar Context] Create event intent. Stored scopes:', integration.provider_data?.scope, 'Parsed event:', analysis.parsedEvent);
      if (analysis.parsedEvent) {
        return await createCalendarEvent(token, analysis.parsedEvent, userTimezone);
      }
      // Could not parse event details — ask user for clarification
      console.warn('[Calendar Context] Create intent detected but could not parse event details from query:', queryText);
      return `## Calendar Action\n\nThe user wants to create a calendar event but the request is missing some details. Ask the user to provide:\n- **Event name/title**\n- **Date** (e.g. "tomorrow", "next Friday", "March 5th")\n- **Time** (optional — e.g. "at 3 PM", "from 2 to 4 PM")\n\nOnce they provide the details, they can say something like: "Schedule [event name] on [date] at [time]"`;
    }

    if (analysis.intent === 'delete_event') {
      return await deleteCalendarEvent(token, analysis);
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
