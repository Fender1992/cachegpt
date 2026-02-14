'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Calendar,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Users,
  Plus,
  Trash2,
  Send,
  RefreshCw,
} from 'lucide-react';
import { useCalendar } from '@/hooks/useCalendar';
import { CalendarEvent } from '@/lib/google-calendar/calendar-client';
import { cn } from '@/lib/utils';

interface CalendarPanelContentProps {
  isActive: boolean;
}

type PanelView = 'events' | 'event_detail' | 'create';

export default function CalendarPanelContent({ isActive }: CalendarPanelContentProps) {
  const calendar = useCalendar();
  const lastRefresh = useRef(0);

  // Refresh events when panel becomes active (tab clicked)
  useEffect(() => {
    if (isActive && calendar.isConnected) {
      const now = Date.now();
      // Debounce: only refresh if >30s since last refresh
      if (now - lastRefresh.current > 30_000) {
        lastRefresh.current = now;
        calendar.refreshEvents();
      }
    }
  }, [isActive, calendar.isConnected, calendar.refreshEvents]);
  const [view, setView] = useState<PanelView>('events');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const EVENTS_PER_PAGE = 10;

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await calendar.refreshEvents();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, calendar.refreshEvents]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    summary: '',
    description: '',
    location: '',
    date: '',
    startTime: '',
    endTime: '',
    allDay: false,
  });

  const handleEventSelect = useCallback((event: CalendarEvent) => {
    calendar.selectEvent(event);
    setView('event_detail');
  }, [calendar.selectEvent]);

  const handleBack = useCallback(() => {
    if (view === 'event_detail') {
      calendar.clearSelectedEvent();
      setView('events');
    } else if (view === 'create') {
      setView('events');
      setNewEvent({ summary: '', description: '', location: '', date: '', startTime: '', endTime: '', allDay: false });
    }
  }, [view, calendar.clearSelectedEvent]);

  const handleCreate = useCallback(async () => {
    if (!newEvent.summary || !newEvent.date || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const start = newEvent.allDay
        ? { date: newEvent.date }
        : { dateTime: new Date(`${newEvent.date}T${newEvent.startTime || '09:00'}`).toISOString() };
      const end = newEvent.allDay
        ? { date: newEvent.date }
        : { dateTime: new Date(`${newEvent.date}T${newEvent.endTime || '10:00'}`).toISOString() };

      const result = await calendar.createEvent({
        summary: newEvent.summary,
        description: newEvent.description || undefined,
        location: newEvent.location || undefined,
        start,
        end,
      });

      if (result) {
        setNewEvent({ summary: '', description: '', location: '', date: '', startTime: '', endTime: '', allDay: false });
        setCreateError(null);
        setView('events');
        calendar.refreshEvents();
      } else {
        setCreateError('Failed to create event. Please check your calendar connection and try again.');
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [newEvent, creating, calendar.createEvent, calendar.refreshEvents]);

  const handleDelete = useCallback(async (eventId: string) => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const success = await calendar.deleteEvent(eventId);
      if (success) {
        setDeleteError(null);
        setView('events');
      } else {
        setDeleteError('Failed to delete event. Please try again.');
      }
    } catch {
      setDeleteError('An unexpected error occurred. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [deleting, calendar.deleteEvent]);

  const formatEventTime = (event: CalendarEvent): string => {
    if (event.isAllDay) return 'All day';
    const start = new Date(event.start.dateTime!);
    const end = new Date(event.end.dateTime!);
    const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${startStr} - ${endStr}`;
  };

  const formatEventDate = (event: CalendarEvent): string => {
    const dateStr = event.isAllDay ? event.start.date! : event.start.dateTime!;
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getRelativeDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((eventDate.getTime() - today.getTime()) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Sort events chronologically
  const sortedEvents = [...calendar.events].sort((a, b) => {
    const aDate = new Date(a.isAllDay ? a.start.date! : a.start.dateTime!);
    const bDate = new Date(b.isAllDay ? b.start.date! : b.start.dateTime!);
    return aDate.getTime() - bDate.getTime();
  });

  // Pagination
  const totalPages = Math.ceil(sortedEvents.length / EVENTS_PER_PAGE);
  const paginatedEvents = sortedEvents.slice(
    currentPage * EVENTS_PER_PAGE,
    (currentPage + 1) * EVENTS_PER_PAGE
  );

  // Reset page when events change
  useEffect(() => {
    setCurrentPage(0);
  }, [calendar.events.length]);

  // Group paginated events by date
  const groupedEvents = paginatedEvents.reduce<Map<string, CalendarEvent[]>>((groups, event) => {
    const dateStr = event.isAllDay ? event.start.date! : event.start.dateTime!;
    const dateKey = new Date(dateStr).toLocaleDateString();
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
    return groups;
  }, new Map());

  return (
    <div className="flex flex-col h-full">
      {/* Error state */}
      {calendar.error && (
        <div className="flex-shrink-0 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{calendar.error}</span>
          </div>
          <button
            onClick={() => calendar.connect()}
            className="mt-2 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {calendar.isConnecting && (
        <div className="flex-shrink-0 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Connecting to Google Calendar...</span>
          </div>
        </div>
      )}

      {!calendar.isConnected && !calendar.isConnecting && !calendar.error && (
        <div className="flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Connect to Google Calendar to view your schedule
          </p>
          <button
            onClick={() => calendar.connect()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Connect Calendar
          </button>
        </div>
      )}

      {/* Navigation header for sub-views */}
      {calendar.isConnected && (view === 'event_detail' || view === 'create') && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleBack}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {view === 'create' ? 'New Event' : 'Event Details'}
          </span>
        </div>
      )}

      {/* Action buttons on events view */}
      {calendar.isConnected && view === 'events' && (
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh events"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Event
          </button>
        </div>
      )}

      {/* Main Content */}
      {calendar.isConnected && (
        <div className="flex-1 overflow-y-auto">
          {view === 'events' && (
            <div>
              {groupedEvents.size > 0 ? (
                Array.from(groupedEvents.entries()).map(([dateKey, events]) => (
                  <div key={dateKey}>
                    <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                      <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                        {getRelativeDate(events[0].isAllDay ? events[0].start.date! : events[0].start.dateTime!)}
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {events.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => handleEventSelect(event)}
                          className="w-full p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              <div className={cn(
                                'w-2 h-2 rounded-full mt-1.5',
                                event.isAllDay ? 'bg-blue-500' : 'bg-blue-400'
                              )} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {event.summary}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatEventTime(event)}
                                </span>
                              </div>
                              {event.location && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-gray-400" />
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {event.location}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No upcoming events</p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {currentPage + 1} / {totalPages} ({sortedEvents.length} events)
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {view === 'create' && (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={newEvent.summary}
                  onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })}
                  placeholder="Meeting with team"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allDay"
                  checked={newEvent.allDay}
                  onChange={(e) => setNewEvent({ ...newEvent, allDay: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="allDay" className="text-sm text-gray-600 dark:text-gray-400">All day</label>
              </div>
              {!newEvent.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start</label>
                    <input
                      type="time"
                      value={newEvent.startTime}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End</label>
                    <input
                      type="time"
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Optional"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {createError && (
                <div className="p-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  {createError}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!newEvent.summary || !newEvent.date || creating}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {creating ? 'Creating...' : 'Create Event'}
                </button>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {view === 'event_detail' && calendar.selectedEvent && (
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {calendar.selectedEvent.summary}
              </h3>

              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-gray-900 dark:text-white">
                      {formatEventDate(calendar.selectedEvent)}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                      {formatEventTime(calendar.selectedEvent)}
                    </div>
                  </div>
                </div>

                {calendar.selectedEvent.location && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-900 dark:text-white">
                      {calendar.selectedEvent.location}
                    </span>
                  </div>
                )}

                {calendar.selectedEvent.attendees.length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <Users className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      {calendar.selectedEvent.attendees.map((attendee, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-gray-900 dark:text-white">
                            {attendee.displayName || attendee.email}
                          </span>
                          {attendee.self && (
                            <span className="text-xs text-blue-500">(you)</span>
                          )}
                          <span className={cn(
                            'text-xs',
                            attendee.responseStatus === 'accepted' && 'text-green-500',
                            attendee.responseStatus === 'declined' && 'text-red-500',
                            attendee.responseStatus === 'tentative' && 'text-yellow-500',
                            attendee.responseStatus === 'needsAction' && 'text-gray-400',
                          )}>
                            {attendee.responseStatus === 'needsAction' ? 'pending' : attendee.responseStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {calendar.selectedEvent.organizer && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Organized by {calendar.selectedEvent.organizer.displayName || calendar.selectedEvent.organizer.email}
                  </div>
                )}
              </div>

              {calendar.selectedEvent.description && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                    {calendar.selectedEvent.description}
                  </div>
                </div>
              )}

              {deleteError && (
                <div className="mt-4 p-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  {deleteError}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                {calendar.selectedEvent.htmlLink && (
                  <a
                    href={calendar.selectedEvent.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <Calendar className="w-4 h-4" />
                    Open in Calendar
                  </a>
                )}
                <button
                  onClick={() => handleDelete(calendar.selectedEvent!.id)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
