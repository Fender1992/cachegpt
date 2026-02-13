'use client';

import { useEffect, useCallback } from 'react';
import { useCalendarContext } from '@/contexts/CalendarContext';
import { CalendarInfo, CalendarEvent } from '@/lib/google-calendar/calendar-client';

export interface UseCalendarOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const calendar = useCalendarContext();
  const {
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  useEffect(() => {
    if (autoConnect && !calendar.isConnected && !calendar.isConnecting && !calendar.error) {
      calendar.connect().catch(console.error);
    }
  }, [autoConnect, calendar.isConnected, calendar.isConnecting, calendar.error]);

  useEffect(() => {
    if (calendar.isConnected && onConnect) {
      onConnect();
    }
  }, [calendar.isConnected, onConnect]);

  useEffect(() => {
    if (!calendar.isConnected && !calendar.isConnecting && onDisconnect) {
      onDisconnect();
    }
  }, [calendar.isConnected, calendar.isConnecting, onDisconnect]);

  useEffect(() => {
    if (calendar.error && onError) {
      onError(calendar.error);
    }
  }, [calendar.error, onError]);

  const connectSafely = useCallback(async (): Promise<boolean> => {
    try {
      await calendar.connect();
      return true;
    } catch (error) {
      console.error('[useCalendar] Connection failed:', error);
      return false;
    }
  }, [calendar.connect]);

  const selectCalendarSafely = useCallback(async (cal: CalendarInfo): Promise<boolean> => {
    try {
      await calendar.selectCalendar(cal);
      return true;
    } catch (error) {
      console.error('[useCalendar] Calendar selection failed:', error);
      return false;
    }
  }, [calendar.selectCalendar]);

  const isReady = calendar.isConnected && !calendar.isConnecting;
  const hasTodayEvents = calendar.todayEventCount > 0;

  const formatEventCount = (count: number): string => {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
  };

  return {
    // Connection state
    isConnected: calendar.isConnected,
    isConnecting: calendar.isConnecting,
    error: calendar.error,
    email: calendar.email,

    // Calendar and event state
    calendars: calendar.calendars,
    selectedCalendar: calendar.selectedCalendar,
    events: calendar.events,
    selectedEvent: calendar.selectedEvent,

    // Counts
    todayEventCount: calendar.todayEventCount,

    // UI state
    isPanelOpen: calendar.isPanelOpen,

    // Connection methods
    connect: connectSafely,
    disconnect: calendar.disconnect,

    // Navigation methods
    selectCalendar: selectCalendarSafely,
    selectEvent: calendar.selectEvent,
    clearSelectedEvent: calendar.clearSelectedEvent,
    loadEvents: calendar.loadEvents,

    // UI methods
    openPanel: calendar.openPanel,
    closePanel: calendar.closePanel,

    // Helper properties
    isReady,
    hasTodayEvents,
    formatEventCount,

    // Raw calendar context
    raw: calendar,
  };
}

export default useCalendar;
