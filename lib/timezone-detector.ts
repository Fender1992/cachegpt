/**
 * User Timezone Detection
 *
 * Detects and formats date/time information based on user's actual timezone
 * Uses multiple detection methods for accuracy
 */

export interface UserTimezoneInfo {
  timezone: string;           // IANA timezone (e.g., 'America/New_York')
  offset: string;             // UTC offset (e.g., 'UTC-5')
  currentDate: string;        // User's local date
  currentTime: string;        // User's local time
  dayOfWeek: string;          // User's day of week
  timestamp: string;          // ISO timestamp in user's timezone
  detectionMethod: 'header' | 'ip' | 'default';
}

/**
 * Detect user's timezone from request headers
 */
export function detectUserTimezone(headers: Headers): UserTimezoneInfo {
  // Method 1: Check for client-provided timezone header (most accurate)
  const clientTimezone = headers.get('x-user-timezone');

  // Method 2: Check for timezone offset header
  const clientOffset = headers.get('x-timezone-offset');

  let timezone: string;
  let detectionMethod: 'header' | 'ip' | 'default';

  if (clientTimezone) {
    // Client explicitly sent their timezone (best case)
    timezone = clientTimezone;
    detectionMethod = 'header';
  } else if (clientOffset) {
    // Client sent offset, convert to timezone
    timezone = offsetToTimezone(parseInt(clientOffset));
    detectionMethod = 'header';
  } else {
    // Fallback: Use server timezone (UTC recommended)
    timezone = 'UTC';
    detectionMethod = 'default';
    console.log('[TIMEZONE-DETECTOR] No client timezone detected, using UTC');
  }

  // Generate localized date/time information
  const now = new Date();

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long'
  });

  // Get UTC offset for the timezone
  const offset = getUTCOffset(timezone);

  return {
    timezone,
    offset,
    currentDate: dateFormatter.format(now),
    currentTime: timeFormatter.format(now),
    dayOfWeek: dayFormatter.format(now),
    timestamp: now.toISOString(),
    detectionMethod
  };
}

/**
 * Convert timezone offset (in minutes) to IANA timezone name
 */
function offsetToTimezone(offsetMinutes: number): string {
  const offsetHours = -offsetMinutes / 60; // JavaScript uses negative offsets

  // Map common offsets to timezones
  const timezoneMap: { [key: number]: string } = {
    '-12': 'Pacific/Auckland',      // UTC+12
    '-11': 'Pacific/Midway',        // UTC+11
    '-10': 'Pacific/Honolulu',      // UTC-10
    '-9': 'America/Anchorage',      // UTC-9
    '-8': 'America/Los_Angeles',    // UTC-8 (PST)
    '-7': 'America/Denver',          // UTC-7 (MST)
    '-6': 'America/Chicago',         // UTC-6 (CST)
    '-5': 'America/New_York',        // UTC-5 (EST)
    '-4': 'America/Halifax',         // UTC-4
    '-3': 'America/Sao_Paulo',       // UTC-3
    '-2': 'Atlantic/South_Georgia',  // UTC-2
    '-1': 'Atlantic/Azores',         // UTC-1
    '0': 'UTC',                      // UTC
    '1': 'Europe/London',            // UTC+1
    '2': 'Europe/Paris',             // UTC+2
    '3': 'Europe/Moscow',            // UTC+3
    '4': 'Asia/Dubai',               // UTC+4
    '5': 'Asia/Karachi',             // UTC+5
    '5.5': 'Asia/Kolkata',           // UTC+5:30
    '6': 'Asia/Dhaka',               // UTC+6
    '7': 'Asia/Bangkok',             // UTC+7
    '8': 'Asia/Shanghai',            // UTC+8
    '9': 'Asia/Tokyo',               // UTC+9
    '10': 'Australia/Sydney',        // UTC+10
    '11': 'Pacific/Noumea',          // UTC+11
    '12': 'Pacific/Auckland'         // UTC+12
  };

  return timezoneMap[offsetHours] || 'UTC';
}

/**
 * Get UTC offset string for a timezone
 */
function getUTCOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });

    const parts = formatter.formatToParts(now);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');

    if (timeZonePart?.value) {
      // Extract offset from timezone name (e.g., "GMT-5" -> "UTC-5")
      const match = timeZonePart.value.match(/GMT([+-]\d+)/);
      if (match) {
        return `UTC${match[1]}`;
      }
    }

    // Fallback: Calculate offset manually
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offset = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);

    return offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
  } catch (error) {
    return 'UTC';
  }
}

/**
 * Format timezone info for context injection
 */
export function formatTimezoneContext(timezoneInfo: UserTimezoneInfo): string {
  // Extract just the time portion for maximum clarity
  const timeOnly = timezoneInfo.currentTime.split(',').pop()?.trim() || timezoneInfo.currentTime;

  return `## ⏰ CRITICAL TIME INFORMATION - READ THIS FIRST ⏰

🕐 CURRENT TIME: ${timeOnly}
📅 CURRENT DATE: ${timezoneInfo.currentDate}
📍 TIMEZONE: ${timezoneInfo.timezone} (${timezoneInfo.offset})
📆 DAY: ${timezoneInfo.dayOfWeek}

⚠️ MANDATORY INSTRUCTIONS FOR ALL RESPONSES:
1. If user asks "what time is it?", "what's the time?", or similar → Answer: "${timeOnly}"
2. NEVER respond with UTC time unless user specifically asks for UTC
3. This is the user's LOCAL time in ${timezoneInfo.timezone}
4. Do not add any conversions or alternate timezones unless requested
5. The answer to "what time is it?" is EXACTLY: "${timeOnly}"

Detection method: ${timezoneInfo.detectionMethod}
`;
}

/**
 * Check if user is in a specific timezone region
 */
export function getUserRegion(timezone: string): string {
  if (timezone.startsWith('America/')) return 'Americas';
  if (timezone.startsWith('Europe/')) return 'Europe';
  if (timezone.startsWith('Asia/')) return 'Asia';
  if (timezone.startsWith('Africa/')) return 'Africa';
  if (timezone.startsWith('Australia/') || timezone.startsWith('Pacific/')) return 'Pacific';
  return 'Unknown';
}

/**
 * Get season based on user's location
 */
export function getSeasonForTimezone(timezone: string): string {
  const now = new Date();
  const month = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'numeric'
    }).format(now)
  );

  const region = getUserRegion(timezone);

  // Adjust seasons for Southern Hemisphere
  const isSouthernHemisphere =
    region === 'Pacific' &&
    (timezone.includes('Australia') || timezone.includes('Zealand'));

  if (isSouthernHemisphere) {
    // Southern Hemisphere seasons are opposite
    if (month >= 12 || month <= 2) return 'Summer';
    if (month >= 3 && month <= 5) return 'Autumn';
    if (month >= 6 && month <= 8) return 'Winter';
    return 'Spring';
  } else {
    // Northern Hemisphere
    if (month >= 12 || month <= 2) return 'Winter';
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    return 'Autumn';
  }
}

/**
 * Enhanced: Get common timezones for suggestions
 */
export const COMMON_TIMEZONES = [
  { label: 'Eastern Time (US)', value: 'America/New_York' },
  { label: 'Central Time (US)', value: 'America/Chicago' },
  { label: 'Mountain Time (US)', value: 'America/Denver' },
  { label: 'Pacific Time (US)', value: 'America/Los_Angeles' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Dubai', value: 'Asia/Dubai' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'UTC', value: 'UTC' }
];
