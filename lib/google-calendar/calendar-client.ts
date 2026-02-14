/**
 * Google Calendar Client Wrapper
 * Routes all Calendar API calls through our backend proxy.
 *
 * Caching strategy:
 * - Calendars: cached with 5min TTL
 * - Events: cached per date range, refreshed on demand
 */

import { supabase } from '@/lib/supabase-client';

export interface CalendarInfo {
  id: string;
  summary: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
  foregroundColor: string;
  accessRole: string;
  selected: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
  htmlLink: string;
  attendees: {
    email: string;
    displayName?: string;
    responseStatus: string;
    self?: boolean;
  }[];
  organizer: {
    email: string;
    displayName?: string;
    self?: boolean;
  } | null;
  isAllDay: boolean;
  recurringEventId?: string;
}

export interface CalendarState {
  isConnected: boolean;
  isConnecting: boolean;
  email: string | null;
  calendars: CalendarInfo[];
  selectedCalendar: CalendarInfo | null;
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  todayEventCount: number;
  error: string | null;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CALENDAR_CACHE_TTL = 5 * 60_000; // 5 minutes

export class CalendarClient {
  private connected = false;
  private listeners: Set<(state: CalendarState) => void> = new Set();
  private state: CalendarState = {
    isConnected: false,
    isConnecting: false,
    email: null,
    calendars: [],
    selectedCalendar: null,
    events: [],
    selectedEvent: null,
    todayEventCount: 0,
    error: null,
  };

  // Caches
  private calendarCache: CacheEntry<CalendarInfo[]> | null = null;
  private eventCache = new Map<string, CalendarEvent[]>(); // "calendarId:dateRange" -> events

  subscribe(listener: (state: CalendarState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private updateState(partial: Partial<CalendarState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => listener(this.state));
  }

  getState(): CalendarState {
    return this.state;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async connect(): Promise<void> {
    if (this.state.isConnected || this.state.isConnecting) return;

    try {
      this.updateState({ isConnecting: true, error: null });

      const headers = await this.getAuthHeader();
      const statusRes = await fetch('/api/integrations/google-calendar', { headers });
      if (!statusRes.ok) {
        throw new Error('Failed to check Google Calendar status');
      }
      const status = await statusRes.json();

      if (!status.connected) {
        throw new Error('Google Calendar not connected. Please link your account in Settings.');
      }

      console.log('[Calendar Client] Connected as', status.email);

      this.connected = true;

      // Fetch calendars
      const calendarsRes = await fetch('/api/integrations/google-calendar/calendars', { headers });
      const calendars: CalendarInfo[] = calendarsRes.ok ? await calendarsRes.json() : [];

      // Cache calendars
      this.calendarCache = { data: calendars, fetchedAt: Date.now() };

      // Fetch upcoming events (30 days) so panel shows future events too
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const futureEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();

      const eventsRes = await fetch(
        `/api/integrations/google-calendar/events?timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(futureEnd)}`,
        { headers }
      );
      const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };
      const allEvents: CalendarEvent[] = eventsData.events || [];

      // Count today's events for the badge
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const todayEventCount = allEvents.filter(e => {
        const eventDate = new Date(e.isAllDay ? e.start.date! : e.start.dateTime!);
        return eventDate >= new Date(todayStart) && eventDate < tomorrow;
      }).length;

      this.updateState({
        isConnected: true,
        isConnecting: false,
        email: status.email,
        calendars,
        todayEventCount,
        events: allEvents,
        error: null,
      });
    } catch (error) {
      console.error('[Calendar Client] Connection error:', error);
      this.connected = false;
      this.updateState({
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Google Calendar',
      });
    }
  }

  disconnect(): void {
    this.connected = false;
    this.calendarCache = null;
    this.eventCache.clear();

    this.updateState({
      isConnected: false,
      isConnecting: false,
      email: null,
      calendars: [],
      selectedCalendar: null,
      events: [],
      selectedEvent: null,
      todayEventCount: 0,
    });
  }

  async selectCalendar(calendar: CalendarInfo): Promise<void> {
    if (!this.connected) return;

    try {
      this.updateState({
        selectedCalendar: calendar,
        selectedEvent: null,
        events: [],
        error: null,
      });

      // Fetch next 7 days of events for selected calendar
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const cacheKey = `${calendar.id}:${timeMin.slice(0, 10)}`;
      const cached = this.eventCache.get(cacheKey);
      if (cached) {
        this.updateState({ events: cached });
      }

      const headers = await this.getAuthHeader();
      const res = await fetch(
        `/api/integrations/google-calendar/events?calendarId=${encodeURIComponent(calendar.id)}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
        { headers }
      );

      if (!res.ok) {
        throw new Error(`Failed to load events: ${res.status}`);
      }

      const data = await res.json();
      const events: CalendarEvent[] = data.events || [];

      this.eventCache.set(cacheKey, events);
      this.updateState({ events });
    } catch (error) {
      console.error('[Calendar Client] Error selecting calendar:', error);
      this.updateState({ error: 'Failed to load events' });
    }
  }

  async loadEvents(timeMin?: string, timeMax?: string, calendarId?: string): Promise<void> {
    if (!this.connected) return;

    try {
      const headers = await this.getAuthHeader();
      const params = new URLSearchParams();
      if (calendarId) params.set('calendarId', calendarId);
      if (timeMin) params.set('timeMin', timeMin);
      if (timeMax) params.set('timeMax', timeMax);

      const res = await fetch(
        `/api/integrations/google-calendar/events?${params}`,
        { headers }
      );

      if (!res.ok) return;

      const data = await res.json();
      this.updateState({ events: data.events || [] });
    } catch (error) {
      console.error('[Calendar Client] Error loading events:', error);
    }
  }

  /**
   * Force refresh events (bypasses connection guard).
   * Called after events are created/deleted from chat.
   */
  async refreshEvents(): Promise<void> {
    if (!this.connected) return;

    try {
      const headers = await this.getAuthHeader();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      // Fetch 30 days of events so future events show up
      const futureEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();

      const eventsRes = await fetch(
        `/api/integrations/google-calendar/events?timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(futureEnd)}`,
        { headers }
      );
      const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };
      const events: CalendarEvent[] = eventsData.events || [];

      // Clear cache so panel shows fresh data
      this.eventCache.clear();

      this.updateState({
        events,
        todayEventCount: events.filter(e => {
          const eventDate = new Date(e.isAllDay ? e.start.date! : e.start.dateTime!);
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return eventDate >= today && eventDate < tomorrow;
        }).length,
      });
    } catch (error) {
      console.error('[Calendar Client] Error refreshing events:', error);
    }
  }

  selectEvent(event: CalendarEvent): void {
    this.updateState({ selectedEvent: event });
  }

  clearSelectedEvent(): void {
    this.updateState({ selectedEvent: null });
  }

  async createEvent(event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: string[];
    calendarId?: string;
  }): Promise<{ id: string; htmlLink: string } | null> {
    if (!this.connected) return null;

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/integrations/google-calendar/events', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to create event' }));
        throw new Error(errorData.error || `Failed to create event (${res.status})`);
      }

      const created = await res.json();
      // Clear event cache so next load picks up the new event
      this.eventCache.clear();
      return created;
    } catch (error) {
      console.error('[Calendar Client] Error creating event:', error);
      throw error;
    }
  }

  async updateEvent(eventId: string, updates: {
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
    calendarId?: string;
  }): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/integrations/google-calendar/events', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ...updates }),
      });

      if (!res.ok) return false;

      this.eventCache.clear();
      return true;
    } catch (error) {
      console.error('[Calendar Client] Error updating event:', error);
      return false;
    }
  }

  async deleteEvent(eventId: string, calendarId?: string): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const headers = await this.getAuthHeader();
      const params = new URLSearchParams({ eventId });
      if (calendarId) params.set('calendarId', calendarId);

      const res = await fetch(
        `/api/integrations/google-calendar/events?${params}`,
        { method: 'DELETE', headers }
      );

      if (!res.ok) return false;

      this.eventCache.clear();
      // Remove from current state
      this.updateState({
        events: this.state.events.filter(e => e.id !== eventId),
        selectedEvent: this.state.selectedEvent?.id === eventId ? null : this.state.selectedEvent,
      });
      return true;
    } catch (error) {
      console.error('[Calendar Client] Error deleting event:', error);
      return false;
    }
  }
}

// Global client instance
export const calendarClient = new CalendarClient();
