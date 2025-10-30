/**
 * Client-Side Timezone Detection
 *
 * Utilities for detecting and sending user's timezone from the browser
 * To be used in Next.js client components
 */

'use client';

/**
 * Get user's IANA timezone (e.g., 'America/New_York')
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('[CLIENT-TIMEZONE] Error detecting timezone:', error);
    return 'UTC';
  }
}

/**
 * Get user's timezone offset in minutes
 */
export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset();
}

/**
 * Create headers with user's timezone information
 */
export function getTimezoneHeaders(): HeadersInit {
  return {
    'x-user-timezone': getUserTimezone(),
    'x-timezone-offset': getTimezoneOffset().toString()
  };
}

/**
 * Enhanced fetch wrapper that automatically includes timezone headers
 */
export async function fetchWithTimezone(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const timezoneHeaders = getTimezoneHeaders();

  const enhancedOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      ...timezoneHeaders
    }
  };

  return fetch(url, enhancedOptions);
}

/**
 * Get formatted local time info for display
 */
export function getLocalTimeInfo(): {
  timezone: string;
  date: string;
  time: string;
  dayOfWeek: string;
} {
  const now = new Date();
  const timezone = getUserTimezone();

  return {
    timezone,
    date: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    }),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' })
  };
}

/**
 * Check if user's browser supports timezone detection
 */
export function supportsTimezoneDetection(): boolean {
  try {
    return Boolean(Intl && Intl.DateTimeFormat);
  } catch {
    return false;
  }
}
