/**
 * Timezone-Aware Middleware
 *
 * Ensures all API requests use the client's timezone dynamically
 * NEVER hard-codes timezone values
 */

import { NextRequest } from 'next/server';
import { detectUserTimezone, UserTimezoneInfo } from './timezone-detector';

export interface TimezoneContext {
  timezone: string;
  timezoneInfo: UserTimezoneInfo;
  setTimezone: (tz: string) => void;
}

/**
 * Extract and validate timezone from request
 * CRITICAL: Always use client-provided timezone
 */
export function extractTimezoneFromRequest(request: NextRequest | Request): UserTimezoneInfo {
  const headers = request.headers;

  // Extract timezone from headers
  const timezoneInfo = detectUserTimezone(headers as Headers);

  // Log for debugging
  console.log(`[TIMEZONE-MIDDLEWARE] Request timezone: ${timezoneInfo.timezone} (${timezoneInfo.detectionMethod})`);

  // Validate timezone is from client, not hard-coded
  if (timezoneInfo.detectionMethod === 'default') {
    console.warn(`[TIMEZONE-MIDDLEWARE] ⚠️ No client timezone provided, falling back to UTC`);
    console.warn(`[TIMEZONE-MIDDLEWARE] Request should include X-Timezone or x-user-timezone header`);
  }

  return timezoneInfo;
}

/**
 * Middleware function for Next.js API routes
 */
export function withTimezone(
  handler: (req: NextRequest, timezone: UserTimezoneInfo) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    const timezoneInfo = extractTimezoneFromRequest(req);

    // Call handler with timezone context
    return handler(req, timezoneInfo);
  };
}

/**
 * Express-style middleware (if needed)
 */
export function timezoneMiddleware(req: any, res: any, next: any) {
  // Extract timezone from headers
  const clientTZ = req.headers['x-timezone'] || req.headers['x-user-timezone'] || 'UTC';
  const clientOffset = req.headers['x-timezone-offset'];

  // Attach to request object
  req.clientTimezone = clientTZ;
  req.timezoneOffset = clientOffset ? parseInt(clientOffset) : 0;

  // Log for monitoring
  console.log(`[TIMEZONE-MIDDLEWARE] Active Timezone: ${clientTZ} (offset: ${clientOffset || '0'})`);

  // IMPORTANT: Never set process.env.TZ globally
  // This would affect all concurrent requests
  // Instead, pass timezone to functions that need it

  next();
}

/**
 * Validate that timezone is coming from client
 */
export function validateTimezoneSource(timezone: string, source: string): void {
  const FORBIDDEN_HARD_CODED = [
    'America/Chicago',
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo'
  ];

  if (source !== 'client-header' && FORBIDDEN_HARD_CODED.includes(timezone)) {
    throw new Error(
      `[TIMEZONE-ERROR] Hard-coded timezone detected: ${timezone}. ` +
      `Timezone MUST come from client headers. Source: ${source}`
    );
  }
}

/**
 * Format date/time using client timezone
 */
export function formatWithClientTimezone(
  date: Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    ...options
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
}

/**
 * Get current date in client's timezone
 */
export function getCurrentDateInTimezone(timezone: string): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
}

/**
 * Get current time in client's timezone
 */
export function getCurrentTimeInTimezone(timezone: string): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Check if two dates are the same day in given timezone
 */
export function isSameDayInTimezone(
  date1: Date,
  date2: Date,
  timezone: string
): boolean {
  const d1 = date1.toLocaleDateString('en-CA', { timeZone: timezone });
  const d2 = date2.toLocaleDateString('en-CA', { timeZone: timezone });
  return d1 === d2;
}

/**
 * Get day boundary timestamps for timezone-aware caching
 */
export function getDayBoundaries(timezone: string): {
  dayStart: Date;
  dayEnd: Date;
  dateString: string;
} {
  const now = new Date();
  const dateString = now.toLocaleDateString('en-CA', { timeZone: timezone });

  // Parse the date in the target timezone
  const dayStart = new Date(dateString + 'T00:00:00');
  const dayEnd = new Date(dateString + 'T23:59:59');

  return { dayStart, dayEnd, dateString };
}

/**
 * Timezone-aware logging utility
 */
export function logWithTimezone(
  message: string,
  timezone: string,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const timestamp = getCurrentTimeInTimezone(timezone);
  const prefix = `[${timestamp} ${timezone}]`;

  switch (level) {
    case 'error':
      console.error(prefix, message);
      break;
    case 'warn':
      console.warn(prefix, message);
      break;
    default:
      console.log(prefix, message);
  }
}

/**
 * Create timezone-aware context for requests
 */
export function createTimezoneContext(request: NextRequest | Request): TimezoneContext {
  const timezoneInfo = extractTimezoneFromRequest(request);

  return {
    timezone: timezoneInfo.timezone,
    timezoneInfo,
    setTimezone: (tz: string) => {
      console.warn('[TIMEZONE-CONTEXT] Manual timezone override:', tz);
      // Log but allow for testing purposes
    }
  };
}

/**
 * Monitoring: Track timezone distribution
 */
const timezoneStats = new Map<string, number>();

export function trackTimezoneUsage(timezone: string): void {
  const count = timezoneStats.get(timezone) || 0;
  timezoneStats.set(timezone, count + 1);
}

export function getTimezoneStats(): { timezone: string; count: number }[] {
  return Array.from(timezoneStats.entries())
    .map(([timezone, count]) => ({ timezone, count }))
    .sort((a, b) => b.count - a.count);
}

export function resetTimezoneStats(): void {
  timezoneStats.clear();
}
