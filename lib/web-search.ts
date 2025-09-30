/**
 * Web Search Integration
 * Fetches current information from the web for queries needing real-time data
 */

interface SearchResult {
  title: string
  snippet: string
  url: string
  relevance: number
}

interface SearchResponse {
  success: boolean
  results: SearchResult[]
  summary: string
  error?: string
}

/**
 * Perform web search using DuckDuckGo Instant Answer API (no API key needed)
 */
export async function searchWeb(query: string): Promise<SearchResponse> {
  try {
    // DuckDuckGo Instant Answer API - free, no API key required
    const encodedQuery = encodeURIComponent(query)
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CacheGPT/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Search API returned ${response.status}`)
    }

    const data = await response.json()

    // Parse DuckDuckGo response
    const results: SearchResult[] = []

    // Add instant answer if available
    if (data.AbstractText) {
      results.push({
        title: data.Heading || 'Summary',
        snippet: data.AbstractText,
        url: data.AbstractURL || '',
        relevance: 1.0
      })
    }

    // Add related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, 5).forEach((topic: any, index: number) => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL,
            relevance: 0.8 - (index * 0.1)
          })
        }
      })
    }

    // Generate summary from results
    const summary = generateSearchSummary(results, query)

    return {
      success: true,
      results,
      summary
    }

  } catch (error) {
    console.error('[WEB-SEARCH] Error:', error)
    return {
      success: false,
      results: [],
      summary: '',
      error: error instanceof Error ? error.message : 'Search failed'
    }
  }
}

/**
 * Generate a summary from search results
 */
function generateSearchSummary(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No immediate results found for "${query}". This may require checking current sources directly.`
  }

  const topResult = results[0]
  let summary = `Based on available information:\n\n${topResult.snippet}`

  if (results.length > 1) {
    summary += `\n\nAdditional context:\n`
    results.slice(1, 3).forEach(result => {
      summary += `- ${result.snippet.substring(0, 150)}...\n`
    })
  }

  if (topResult.url) {
    summary += `\n\nSource: ${topResult.url}`
  }

  return summary
}

/**
 * Fallback: Use Wikipedia API for factual queries
 */
export async function searchWikipedia(query: string): Promise<SearchResponse> {
  try {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CacheGPT/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Wikipedia API returned ${response.status}`)
    }

    const data = await response.json()

    const results: SearchResult[] = [{
      title: data.title || query,
      snippet: data.extract || '',
      url: data.content_urls?.desktop?.page || '',
      relevance: 1.0
    }]

    return {
      success: true,
      results,
      summary: data.extract || ''
    }

  } catch (error) {
    console.error('[WIKI-SEARCH] Error:', error)
    return {
      success: false,
      results: [],
      summary: '',
      error: error instanceof Error ? error.message : 'Wikipedia search failed'
    }
  }
}

/**
 * Intelligent search that tries multiple sources
 */
export async function intelligentSearch(query: string, category: string | null): Promise<SearchResponse> {
  // For factual/encyclopedia queries, try Wikipedia first
  if (category === 'general' || category === 'science' || category === 'geography') {
    const wikiResult = await searchWikipedia(query)
    if (wikiResult.success && wikiResult.summary) {
      return wikiResult
    }
  }

  // For everything else, use DuckDuckGo
  const webResult = await searchWeb(query)
  return webResult
}

/**
 * Format search results for AI context
 */
export function formatSearchForContext(searchResponse: SearchResponse, query: string): string {
  if (!searchResponse.success) {
    return `[Search attempted but no results available. Please provide answer based on your knowledge.]`
  }

  if (searchResponse.results.length === 0) {
    return `[No current information found for this query.]`
  }

  let context = `[Real-time Search Results for "${query}"]\n\n`
  context += searchResponse.summary

  if (searchResponse.results.length > 0) {
    context += `\n\nSources:\n`
    searchResponse.results.slice(0, 3).forEach((result, index) => {
      context += `${index + 1}. ${result.title}: ${result.url}\n`
    })
  }

  context += `\n[Use this information to provide an accurate, up-to-date answer.]`

  return context
}

/**
 * Determine if search should be performed based on query analysis
 */
export function shouldPerformSearch(
  category: string | null,
  confidence: number
): boolean {
  if (!category) return false

  // High-value categories that benefit from search
  const searchableCategories = ['news', 'weather', 'stocks', 'sports', 'technology']

  // Only search if confidence is high enough
  return searchableCategories.includes(category) && confidence >= 0.85
}

/**
 * Main search function with intelligent routing
 */
export async function performContextualSearch(
  query: string,
  category: string | null,
  confidence: number
): Promise<string | null> {
  // Don't search for simple date/time queries (we provide that directly)
  if (category === 'datetime') {
    return null
  }

  // Check if we should perform search
  if (!shouldPerformSearch(category, confidence)) {
    return null
  }

  try {
    console.log(`[SEARCH] Performing search for category: ${category}, confidence: ${confidence}`)
    const searchResult = await intelligentSearch(query, category)
    return formatSearchForContext(searchResult, query)
  } catch (error) {
    console.error('[SEARCH] Error performing search:', error)
    return null
  }
}