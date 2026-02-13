'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Users,
} from 'lucide-react';
import { useCalendar } from '@/hooks/useCalendar';
import { CalendarInfo, CalendarEvent } from '@/lib/google-calendar/calendar-client';
import { cn } from '@/lib/utils';

interface CalendarPanelProps {
  className?: string;
}

type PanelView = 'events' | 'event_detail';

export default function CalendarPanel({ className }: CalendarPanelProps) {
  const calendar = useCalendar();
  const [view, setView] = useState<PanelView>('events');

  // Reset view when panel closes
  useEffect(() => {
    if (!calendar.isPanelOpen) {
      setView('events');
    }
  }, [calendar.isPanelOpen]);

  const handleEventSelect = useCallback((event: CalendarEvent) => {
    calendar.selectEvent(event);
    setView('event_detail');
  }, [calendar.selectEvent]);

  const handleBack = useCallback(() => {
    if (view === 'event_detail') {
      calendar.clearSelectedEvent();
      setView('events');
    }
  }, [view, calendar.clearSelectedEvent]);

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

  // Group events by date
  const groupedEvents = calendar.events.reduce<Map<string, CalendarEvent[]>>((groups, event) => {
    const dateStr = event.isAllDay ? event.start.date! : event.start.dateTime!;
    const dateKey = new Date(dateStr).toLocaleDateString();
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
    return groups;
  }, new Map());

  if (!calendar.isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={calendar.closePanel}
      />
      <div className={cn(
        'fixed top-[85px] left-0 h-[calc(100%-85px-4rem)] w-96 max-w-[85vw] bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col rounded-br-xl',
        'transform transition-transform duration-300 ease-in-out',
        className
      )}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            {view !== 'events' && (
              <button
                onClick={handleBack}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Calendar
            </h2>
            {calendar.isConnected && calendar.email && (
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                {calendar.email}
              </span>
            )}
          </div>
          <button
            onClick={calendar.closePanel}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close Calendar panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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

        {/* Main Content */}
        {calendar.isConnected && (
          <div className="flex-1 overflow-y-auto">
            {/* Events List View */}
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
              </div>
            )}

            {/* Event Detail View */}
            {view === 'event_detail' && calendar.selectedEvent && (
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  {calendar.selectedEvent.summary}
                </h3>

                <div className="space-y-3 mb-4">
                  {/* Date & Time */}
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

                  {/* Location */}
                  {calendar.selectedEvent.location && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-900 dark:text-white">
                        {calendar.selectedEvent.location}
                      </span>
                    </div>
                  )}

                  {/* Attendees */}
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

                  {/* Organizer */}
                  {calendar.selectedEvent.organizer && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Organized by {calendar.selectedEvent.organizer.displayName || calendar.selectedEvent.organizer.email}
                    </div>
                  )}
                </div>

                {/* Description */}
                {calendar.selectedEvent.description && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {calendar.selectedEvent.description}
                    </div>
                  </div>
                )}

                {/* Open in Google Calendar */}
                {calendar.selectedEvent.htmlLink && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <a
                      href={calendar.selectedEvent.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      Open in Google Calendar
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
