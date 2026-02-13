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

    return unsubscribe;
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
