'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { calendarClient, CalendarState, CalendarInfo, CalendarEvent } from '@/lib/google-calendar/calendar-client';
import { panelManager } from '@/lib/panel-manager';

interface CalendarContextValue extends CalendarState {
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;

  // Navigation methods
  selectCalendar: (calendar: CalendarInfo) => Promise<void>;
  selectEvent: (event: CalendarEvent) => void;
  clearSelectedEvent: () => void;
  loadEvents: (timeMin?: string, timeMax?: string, calendarId?: string) => Promise<void>;

  // CRUD methods
  createEvent: (event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: string[];
  }) => Promise<{ id: string; htmlLink: string } | null>;
  updateEvent: (eventId: string, updates: Record<string, any>) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<boolean>;
  refreshEvents: () => Promise<void>;

  // UI state
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

interface CalendarProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function CalendarProvider({ children, autoConnect = false }: CalendarProviderProps) {
  const [state, setState] = useState<CalendarState>(calendarClient.getState());
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = calendarClient.subscribe(setState);

    if (autoConnect && !state.isConnected && !state.isConnecting && !state.error) {
      calendarClient.connect().catch(console.error);
    }

    // Listen for calendar events created/deleted from chat
    const handleCalendarChanged = () => {
      calendarClient.refreshEvents().catch(console.error);
    };
    window.addEventListener('calendar-event-changed', handleCalendarChanged);

    return () => {
      unsubscribe();
      window.removeEventListener('calendar-event-changed', handleCalendarChanged);
    };
  }, [autoConnect, state.isConnected, state.isConnecting, state.error]);

  const connect = async (): Promise<void> => {
    return calendarClient.connect();
  };

  const disconnect = (): void => {
    calendarClient.disconnect();
    setIsPanelOpen(false);
  };

  const selectCalendar = async (calendar: CalendarInfo): Promise<void> => {
    return calendarClient.selectCalendar(calendar);
  };

  const selectEvent = (event: CalendarEvent): void => {
    calendarClient.selectEvent(event);
  };

  const clearSelectedEvent = (): void => {
    calendarClient.clearSelectedEvent();
  };

  const loadEvents = async (timeMin?: string, timeMax?: string, calendarId?: string): Promise<void> => {
    return calendarClient.loadEvents(timeMin, timeMax, calendarId);
  };

  const createEvent: CalendarContextValue['createEvent'] = async (event) => {
    return calendarClient.createEvent(event);
  };

  const updateEvent: CalendarContextValue['updateEvent'] = async (eventId, updates) => {
    return calendarClient.updateEvent(eventId, updates);
  };

  const deleteEvent: CalendarContextValue['deleteEvent'] = async (eventId) => {
    return calendarClient.deleteEvent(eventId);
  };

  const refreshEvents = async (): Promise<void> => {
    return calendarClient.refreshEvents();
  };

  const closePanel = useCallback((): void => {
    setIsPanelOpen(false);
  }, []);

  // Register with panel manager
  useEffect(() => {
    panelManager.register('calendar', closePanel);
  }, [closePanel]);

  const openPanel = (): void => {
    panelManager.onOpen('calendar'); // Close other panels
    setIsPanelOpen(true);
  };

  const contextValue: CalendarContextValue = {
    ...state,
    connect,
    disconnect,
    selectCalendar,
    selectEvent,
    clearSelectedEvent,
    loadEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    refreshEvents,
    isPanelOpen,
    openPanel,
    closePanel,
  };

  return (
    <CalendarContext.Provider value={contextValue}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarContext(): CalendarContextValue {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendarContext must be used within a CalendarProvider');
  }
  return context;
}

export default CalendarContext;
