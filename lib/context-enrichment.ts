/**
 * Context Enrichment System
 * Provides AI models with current information and real-time data access
 * Now enhanced with Grokipedia for superior encyclopedic content
 */

import { grokipediaService, isEncyclopedicQuery, GrokipediaResult } from './grokipedia-service';
import { detectUserTimezone, formatTimezoneContext, getSeasonForTimezone, UserTimezoneInfo } from './timezone-detector';

/**
 * Generate dynamic system context with current information
 * Now supports user's actual timezone
 */
export function generateSystemContext(userTimezone?: UserTimezoneInfo): string {
  const now = new Date()

  // Use user's timezone if provided, otherwise use server time
  const timezone = userTimezone?.timezone || 'UTC';

  // Current date and time information in user's timezone
  const dateContext = {
    date: now.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: now.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    }),
    timestamp: now.toISOString(),
    year: now.getFullYear(),
    month: now.toLocaleString('en-US', {
      timeZone: timezone,
      month: 'long'
    }),
    dayOfWeek: now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long'
    }),
    quarter: `Q${Math.floor((now.getMonth() / 3)) + 1}`,
    season: userTimezone ? getSeasonForTimezone(timezone) : getSeason(now)
  }

  // Technology and version context
  const techContext = {
    latestNodeLTS: 'Node.js 22.x LTS',
    latestPython: 'Python 3.12',
    latestReact: 'React 18',
    latestNext: 'Next.js 15',
    latestTypeScript: 'TypeScript 5.9'
  }

  // World events context (updateable)
  const worldContext = {
    majorEvents: [
      'AI models: GPT-4, Claude 3, Gemini Pro are current',
      'Web technologies: React 19, Vue 3, Svelte 5 are mainstream',
      'Cloud platforms: AWS, Azure, GCP, Vercel are dominant'
    ]
  }

  let contextStr = `# Current Context (Auto-Updated)\n\n`;

  // Add timezone-specific information if available
  if (userTimezone) {
    // Put timezone context at the very top for maximum visibility
    contextStr += `${formatTimezoneContext(userTimezone)}\n\n`;
  } else {
    // Fallback to UTC with clear warning
    contextStr += `## ⚠️ Date & Time (Server Time - UTC - User timezone not detected)
- **Current Date**: ${dateContext.date}
- **Current Time**: ${dateContext.time}
- **ISO Timestamp**: ${dateContext.timestamp}
- **Year**: ${dateContext.year}
- **Month**: ${dateContext.month}
- **Day**: ${dateContext.dayOfWeek}
- **Quarter**: ${dateContext.quarter}
- **Season**: ${dateContext.season}

NOTE: This is server time in UTC. The user's local time may be different.

`;
  }

  contextStr += `## Technology Versions (Latest Stable)
- ${techContext.latestNodeLTS}
- ${techContext.latestPython}
- ${techContext.latestReact}
- ${techContext.latestNext}
- ${techContext.latestTypeScript}

## Current Technology Landscape
${worldContext.majorEvents.map(event => `- ${event}`).join('\n')}

**Important**: When asked about current events, news, stock prices, weather, or other real-time information you don't have, clearly state that you need up-to-date information and suggest the user verify through current sources.`;

  return contextStr;
}

/**
 * Get current season based on date
 */
function getSeason(date: Date): string {
  const month = date.getMonth()
  const day = date.getDate()

  // Northern Hemisphere seasons
  if ((month === 11 && day >= 21) || month === 0 || month === 1 || (month === 2 && day < 20)) {
    return 'Winter'
  } else if ((month === 2 && day >= 20) || month === 3 || month === 4 || (month === 5 && day < 21)) {
    return 'Spring'
  } else if ((month === 5 && day >= 21) || month === 6 || month === 7 || (month === 8 && day < 22)) {
    return 'Summer'
  } else {
    return 'Fall'
  }
}

/**
 * Analyze query to determine if it needs real-time information
 */
export function needsRealTimeInfo(query: string): {
  needsInfo: boolean
  category: string | null
  confidence: number
} {
  const lowerQuery = query.toLowerCase()
  // Pattern matching for different categories
  const patterns = {
    datetime: {
      keywords: ['today', 'current date', 'what time', 'right now', 'this week', 'this month', 'this year', 'date today', 'what day'],
      confidence: 0.9
    },
    news: {
      keywords: ['latest news', 'current events', 'breaking news', 'happening now', 'recent news', 'today\'s news', 'what happened', 'what\'s happening', 'any news about', 'tell me about'],
      confidence: 0.85 // Lower confidence for broader patterns
    },
    weather: {
      keywords: ['weather', 'temperature', 'forecast', 'rain', 'snow', 'climate today'],
      confidence: 0.95
    },
    stocks: {
      keywords: ['stock price', 'market', 'trading', 'nasdaq', 'dow jones', 'crypto price', 'bitcoin'],
      confidence: 0.95
    },
    sports: {
      keywords: ['game score', 'match result', 'championship', 'tournament', 'sports news', 'who won'],
      confidence: 0.9
    },
    technology: {
      keywords: ['latest version', 'new release', 'just announced', 'recently launched', 'updated to'],
      confidence: 0.85
    },
    general: {
      keywords: ['current', 'latest', 'recent', 'now', 'nowadays', 'these days', 'currently'],
      confidence: 0.7
    }
  }

  // Check each category
  for (const [category, { keywords, confidence }] of Object.entries(patterns)) {
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        return {
          needsInfo: true,
          category,
          confidence
        }
      }
    }
  }

  return {
    needsInfo: false,
    category: null,
    confidence: 0
  }
}

/**
 * Enrich user query with context hints
 */
export function enrichQueryWithContext(query: string): string {
  const analysis = needsRealTimeInfo(query)

  if (!analysis.needsInfo) {
    return query
  }

  const now = new Date()
  let contextHint = ''

  switch (analysis.category) {
    case 'datetime':
      contextHint = `\n\n[Context: Current date is ${now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}, time is ${now.toLocaleTimeString('en-US')}]`
      break

    case 'news':
    case 'weather':
    case 'stocks':
    case 'sports':
      contextHint = `\n\n[Note: This question requires real-time information. Please provide the best answer based on your knowledge, and suggest the user check current sources for the most up-to-date information.]`
      break

    case 'technology':
      contextHint = `\n\n[Context: As of ${now.getFullYear()}, please provide information based on latest known versions and trends.]`
      break

    case 'general':
      contextHint = `\n\n[Context: Current date is ${now.toLocaleDateString('en-US')}]`
      break
  }

  return query + contextHint
}

/**
 * Generate helpful suggestions for queries needing real-time data
 */
export function generateRealTimeSuggestions(category: string): string {
  const suggestions: { [key: string]: string } = {
    news: 'For current news, check: news.google.com, reuters.com, or bbc.com',
    weather: 'For current weather, check: weather.com, weather.gov, or your local weather service',
    stocks: 'For live stock prices, check: finance.yahoo.com, bloomberg.com, or marketwatch.com',
    sports: 'For live scores and results, check: espn.com, sports.yahoo.com, or official league websites',
    technology: 'For latest tech news, check: techcrunch.com, theverge.com, or official product websites'
  }

  return suggestions[category] || 'For current information, please check authoritative sources online.'
}

/**
 * Common knowledge base for frequently asked questions
 */
export const commonKnowledge = {
  measurements: {
    'how many feet in a mile': '5,280 feet',
    'how many inches in a foot': '12 inches',
    'how many ounces in a pound': '16 ounces',
    'how many grams in a kilogram': '1,000 grams',
    'how many meters in a kilometer': '1,000 meters',
    'how many milliliters in a liter': '1,000 milliliters'
  },
  conversions: {
    'celsius to fahrenheit': 'F = (C × 9/5) + 32',
    'fahrenheit to celsius': 'C = (F - 32) × 5/9',
    'miles to kilometers': '1 mile = 1.609 kilometers',
    'kilometers to miles': '1 kilometer = 0.621 miles',
    'pounds to kilograms': '1 pound = 0.453 kilograms',
    'kilograms to pounds': '1 kilogram = 2.205 pounds'
  },
  general: {
    'speed of light': '299,792,458 meters per second (186,282 miles per second)',
    'boiling point of water': '100°C (212°F) at sea level',
    'freezing point of water': '0°C (32°F) at sea level',
    'days in a year': '365 days (366 in leap years)',
    'hours in a day': '24 hours',
    'minutes in an hour': '60 minutes'
  },
  geography: {
    'largest ocean': 'Pacific Ocean',
    'largest continent': 'Asia',
    'tallest mountain': 'Mount Everest (8,849 meters / 29,032 feet)',
    'longest river': 'Nile River (6,650 km / 4,130 miles)',
    'largest country': 'Russia (by area)',
    'most populous country': 'India (as of 2023)'
  },
  science: {
    'elements in periodic table': '118 known elements',
    'planets in solar system': '8 planets (Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune)',
    'speed of sound': '343 meters per second (1,125 feet per second) at sea level',
    'earth circumference': 'Approximately 40,075 km (24,901 miles) at equator'
  }
}

/**
 * Check if query matches common knowledge
 */
export function getCommonKnowledge(query: string): string | null {
  const lowerQuery = query.toLowerCase().trim()

  for (const category of Object.values(commonKnowledge)) {
    for (const [question, answer] of Object.entries(category)) {
      if (lowerQuery.includes(question) || question.includes(lowerQuery)) {
        return answer
      }
    }
  }

  return null
}

/**
 * Main context enrichment function
 * Now includes Grokipedia detection and user timezone support
 */
export function enrichContext(userQuery: string, userTimezone?: UserTimezoneInfo): {
  enrichedQuery: string
  systemContext: string
  needsRealTime: boolean
  realTimeCategory: string | null
  commonAnswer: string | null
  isEncyclopedic: boolean
  shouldUseGrokipedia: boolean
} {
  const systemContext = generateSystemContext(userTimezone)
  const realTimeAnalysis = needsRealTimeInfo(userQuery)
  const commonAnswer = getCommonKnowledge(userQuery)
  const enrichedQuery = enrichQueryWithContext(userQuery)
  const isEncyclopedic = isEncyclopedicQuery(userQuery)

  // Use Grokipedia for encyclopedic queries if service is available
  const shouldUseGrokipedia = isEncyclopedic && grokipediaService.isEnabled()

  return {
    enrichedQuery,
    systemContext,
    needsRealTime: realTimeAnalysis.needsInfo,
    realTimeCategory: realTimeAnalysis.category,
    commonAnswer,
    isEncyclopedic,
    shouldUseGrokipedia
  }
}

/**
 * Fetch Grokipedia content for encyclopedic queries
 */
export async function getGrokipediaContext(query: string): Promise<string | null> {
  try {
    const result = await grokipediaService.fetchEncyclopedicContent(query, {
      maxTokens: 2000,
      detailedMode: true,
      includeWebSearch: true
    })

    if (!result) {
      return null
    }

    // Format for context injection
    let context = `[Grokipedia Encyclopedic Knowledge]\n\n`
    context += result.content

    if (result.sources.length > 0) {
      context += `\n\n**Verified Sources:**\n`
      result.sources.slice(0, 5).forEach((source, index) => {
        context += `${index + 1}. ${source}\n`
      })
    }

    context += `\n[Confidence: ${(result.confidence * 100).toFixed(0)}%]`
    context += `\n[This is verified encyclopedic knowledge. Use it to provide accurate, comprehensive answers.]`

    return context
  } catch (error) {
    console.error('[GROKIPEDIA-CONTEXT] Error fetching context:', error)
    return null
  }
}