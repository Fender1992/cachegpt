/**
 * Brave Search API Integration
 * Free tier: 2,000 queries/month
 * Returns real web search results with snippets and freshness info
 */

interface BraveSearchResult {
  title: string;
  snippet: string;
  url: string;
  age?: string;
}

interface BraveSearchResponse {
  success: boolean;
  results: BraveSearchResult[];
  error?: string;
}

/**
 * Search the web using Brave Search API
 */
export async function searchBrave(query: string): Promise<BraveSearchResponse> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return { success: false, results: [], error: 'BRAVE_SEARCH_API_KEY not set' };
  }

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=5&text_decorations=false`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Brave Search API returned ${response.status}`);
    }

    const data = await response.json();
    const results: BraveSearchResult[] = [];

    if (data.web?.results) {
      for (const item of data.web.results.slice(0, 5)) {
        results.push({
          title: item.title || '',
          snippet: item.description || '',
          url: item.url || '',
          age: item.age,
        });
      }
    }

    return { success: results.length > 0, results };
  } catch (error) {
    console.error('[BRAVE-SEARCH] Error:', error);
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'Brave search failed',
    };
  }
}

/**
 * Check if Brave Search is available
 */
export function isBraveSearchAvailable(): boolean {
  return !!process.env.BRAVE_SEARCH_API_KEY;
}
