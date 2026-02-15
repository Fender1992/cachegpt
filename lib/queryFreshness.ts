/**
 * Query Freshness Detection
 *
 * Identifies time-sensitive queries that need live data instead of cached responses
 * Prevents stale information for "recent", "current", "today" type queries
 */

export interface FreshnessAnalysis {
  isTimeSensitive: boolean;
  reason: string;
  category: 'current' | 'recent' | 'breaking' | 'temporal' | 'static';
  ttl: number; // Recommended TTL in seconds
  bypassCache: boolean;
}

/**
 * Patterns that indicate time-sensitive queries
 */
const TIME_SENSITIVE_PATTERNS = {
  // Current moment
  current: {
    patterns: [
      /\b(now|right now|currently|at the moment|at this time)\b/i,
      /\bwhat time is it\b/i,
      /\bwhat('s| is) the time\b/i,
    ],
    ttl: 60, // 1 minute
    category: 'current' as const
  },

  // Today
  today: {
    patterns: [
      /\b(today|this morning|this afternoon|this evening|tonight)\b/i,
      /\bwhat day is (it|today)\b/i,
      /\bwhat('s| is) happening today\b/i,
    ],
    ttl: 3600, // 1 hour
    category: 'temporal' as const
  },

  // Recent/Yesterday
  recent: {
    patterns: [
      /\b(yesterday|last night|this week|this month|past (week|month|day))\b/i,
      /\b(recent|recently|latest|newest|just (happened|released|announced))\b/i,
      /\bwhat happened (yesterday|last night|recently)\b/i,
    ],
    ttl: 7200, // 2 hours
    category: 'recent' as const
  },

  // Breaking/News
  breaking: {
    patterns: [
      /\b(breaking|urgent|alert|just in|developing|happening)\b/i,
      /\b(news|headline|report|announcement|update)s?\b/i,
      /\bwhat('s| is) in the news\b/i,
      /\blatest (news|updates?|developments?)\b/i,
    ],
    ttl: 1800, // 30 minutes
    category: 'breaking' as const
  },

  // Real-time data
  realtime: {
    patterns: [
      /\b(live|real-time|current status|up-to-date)\b/i,
      /\b(weather|temperature|forecast)\b/i,
      /\b(stock price|market|trading|crypto)\b/i,
      /\b(score|game|match result)\b/i,
    ],
    ttl: 300, // 5 minutes
    category: 'current' as const
  },

  // Temporal references that need context
  temporal: {
    patterns: [
      /\b(this year|in 202\d)\b/i,
      /\b(upcoming|coming|next (week|month))\b/i,
      /\b(schedule|calendar|date|deadline)\b/i,
    ],
    ttl: 7200, // 2 hours
    category: 'temporal' as const
  }
};

/**
 * Check if a query is time-sensitive and needs fresh data
 */
export function isTimeSensitive(query: string): boolean {
  const analysis = analyzeFreshness(query);
  return analysis.isTimeSensitive;
}

/**
 * Comprehensive freshness analysis
 */
export function analyzeFreshness(query: string): FreshnessAnalysis {
  const lowerQuery = query.toLowerCase();

  // Check each pattern category
  for (const [key, config] of Object.entries(TIME_SENSITIVE_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerQuery)) {
        return {
          isTimeSensitive: true,
          reason: `Matched ${key} pattern`,
          category: config.category,
          ttl: config.ttl,
          bypassCache: true
        };
      }
    }
  }

  // Default: Static query, safe to cache long-term
  return {
    isTimeSensitive: false,
    reason: 'No time-sensitive patterns detected',
    category: 'static',
    ttl: 86400, // 24 hours
    bypassCache: false
  };
}

/**
 * Get recommended cache TTL based on query freshness
 */
export function getRecommendedTTL(query: string): number {
  const analysis = analyzeFreshness(query);
  return analysis.ttl;
}

/**
 * Generate timezone-aware cache key
 * Includes date for daily cache rotation on temporal queries
 */
export function generateCacheKey(
  query: string,
  timezone: string,
  model?: string,
  provider?: string
): string {
  const analysis = analyzeFreshness(query);

  // For time-sensitive queries, include date in key for daily rotation
  if (analysis.isTimeSensitive) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD

    return `fresh:${query}:${timezone}:${dateStr}:${model || 'default'}:${provider || 'auto'}`;
  }

  // For static queries, use longer-lived cache
  return `static:${query}:${timezone}:${model || 'default'}:${provider || 'auto'}`;
}

/**
 * Check if cache entry should be considered stale
 */
export function isCacheStale(
  cachedAt: Date,
  query: string,
  timezone: string
): boolean {
  const analysis = analyzeFreshness(query);
  const now = new Date();
  const ageSeconds = (now.getTime() - cachedAt.getTime()) / 1000;

  // Check if cache has exceeded TTL
  if (ageSeconds > analysis.ttl) {
    return true;
  }

  // For temporal queries, check if date has changed
  if (analysis.category === 'temporal' || analysis.category === 'current') {
    const cachedDate = cachedAt.toLocaleDateString('en-CA', { timeZone: timezone });
    const currentDate = now.toLocaleDateString('en-CA', { timeZone: timezone });

    if (cachedDate !== currentDate) {
      return true;
    }
  }

  return false;
}

/**
 * Get context enrichment hints based on freshness
 */
export function getFreshnessContextHints(query: string, timezone: string): string {
  const analysis = analyzeFreshness(query);

  if (!analysis.isTimeSensitive) {
    return '';
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const hints: { [key: string]: string } = {
    current: `**IMPORTANT**: This query asks for CURRENT information. Current time: ${timeStr} (${timezone}). Provide real-time data.`,
    temporal: `**IMPORTANT**: This query is time-sensitive. Current date: ${dateStr} (${timezone}). Ensure data is up-to-date.`,
    recent: `**IMPORTANT**: This query asks for RECENT information. Current date: ${dateStr}. Provide latest updates.`,
    breaking: `**IMPORTANT**: This query asks for BREAKING/NEWS information. Provide the most current data available.`
  };

  return hints[analysis.category] || '';
}

/**
 * Statistics for monitoring
 */
let stats = {
  totalQueries: 0,
  timeSensitiveQueries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  freshFetches: 0
};

export function trackQueryStats(isTimeSensitive: boolean, cacheHit: boolean) {
  stats.totalQueries++;
  if (isTimeSensitive) {
    stats.timeSensitiveQueries++;
    stats.freshFetches++;
  }
  if (cacheHit) {
    stats.cacheHits++;
  } else {
    stats.cacheMisses++;
  }
}

export function getQueryStats() {
  return {
    ...stats,
    timeSensitivePercentage: ((stats.timeSensitiveQueries / stats.totalQueries) * 100).toFixed(2),
    cacheHitRate: ((stats.cacheHits / stats.totalQueries) * 100).toFixed(2)
  };
}

export function resetQueryStats() {
  stats = {
    totalQueries: 0,
    timeSensitiveQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    freshFetches: 0
  };
}
