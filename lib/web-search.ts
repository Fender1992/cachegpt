/**
 * Web Search Integration
 * Fetches current information from the web for queries needing real-time data
 * Now powered by Grokipedia for encyclopedic content (replaces Wikipedia)
 */

import { grokipediaService, formatGrokipediaForContext, isEncyclopedicQuery } from './grokipedia-service';
import { searchBrave, isBraveSearchAvailable } from './brave-search-service';
import { searchDDGHtml } from './duckduckgo-html-search';

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
 * Grokipedia: AI-enhanced encyclopedic search (replaces Wikipedia)
 * Uses Grok's advanced reasoning and web search capabilities
 */
export async function searchGrokipedia(query: string): Promise<SearchResponse> {
  try {
    // Use Grokipedia service for encyclopedic content
    const result = await grokipediaService.fetchEncyclopedicContent(query, {
      maxTokens: 1500,
      detailedMode: false,
      includeWebSearch: true
    });

    if (!result) {
      throw new Error('Grokipedia returned no results');
    }

    // Format as SearchResult
    const results: SearchResult[] = [{
      title: `Grokipedia: ${query}`,
      snippet: result.content.substring(0, 500) + (result.content.length > 500 ? '...' : ''),
      url: result.sources[0] || 'https://cachegpt.app',
      relevance: result.confidence
    }];

    // Add source results
    result.sources.slice(0, 3).forEach((source, index) => {
      results.push({
        title: `Source ${index + 1}`,
        snippet: source,
        url: source,
        relevance: 0.9 - (index * 0.1)
      });
    });

    return {
      success: true,
      results,
      summary: result.content
    };

  } catch (error) {
    console.error('[GROKIPEDIA-SEARCH] Error:', error);
    return {
      success: false,
      results: [],
      summary: '',
      error: error instanceof Error ? error.message : 'Grokipedia search failed'
    };
  }
}

/**
 * Intelligent search with cascading fallback
 * Priority: Grokipedia → Brave Search → DDG HTML → DDG Instant Answer
 */
export async function intelligentSearch(query: string, category: string | null): Promise<SearchResponse> {
  // Check if query is encyclopedic in nature
  const isEncyclopedic = isEncyclopedicQuery(query);

  // 1. For factual/encyclopedia queries, try Grokipedia first
  if (isEncyclopedic || category === 'general' || category === 'science' || category === 'geography') {
    const grokResult = await searchGrokipedia(query);
    if (grokResult.success && grokResult.summary) {
      return grokResult;
    }
  }

  // 2. Try Brave Search (real search results, needs API key)
  if (isBraveSearchAvailable()) {
    try {
      const braveResult = await searchBrave(query);
      if (braveResult.success && braveResult.results.length > 0) {
        const results: SearchResult[] = braveResult.results.map((r, i) => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
          relevance: 1.0 - (i * 0.1),
        }));
        return {
          success: true,
          results,
          summary: generateSearchSummary(results, query),
        };
      }
    } catch (error) {
      console.error('[INTELLIGENT-SEARCH] Brave fallback error:', error);
    }
  }

  // 3. Try DuckDuckGo HTML scraping (free, no API key)
  try {
    const ddgResult = await searchDDGHtml(query);
    if (ddgResult.success && ddgResult.results.length > 0) {
      const results: SearchResult[] = ddgResult.results.map((r, i) => ({
        title: r.title,
        snippet: r.snippet,
        url: r.url,
        relevance: 0.9 - (i * 0.1),
      }));
      return {
        success: true,
        results,
        summary: generateSearchSummary(results, query),
      };
    }
  } catch (error) {
    console.error('[INTELLIGENT-SEARCH] DDG HTML fallback error:', error);
  }

  // 4. Last resort: DuckDuckGo Instant Answer API
  const webResult = await searchWeb(query);
  return webResult;
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
  const searchableCategories = ['news', 'weather', 'stocks', 'sports', 'technology', 'situation', 'geopolitical', 'events']

  // Lower threshold to catch broader queries (was 0.80)
  return searchableCategories.includes(category) && confidence >= 0.70
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
  const shouldSearch = shouldPerformSearch(category, confidence)

  if (!shouldSearch) {
    return null
  }

  try {
    const searchResult = await intelligentSearch(query, category)
    return formatSearchForContext(searchResult, query)
  } catch (error) {
    console.error('[WEB-SEARCH] ❌ Error performing search:', error)
    return null
  }
}