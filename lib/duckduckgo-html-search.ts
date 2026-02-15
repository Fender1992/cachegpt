/**
 * DuckDuckGo HTML Search Fallback
 * No API key needed — scrapes html.duckduckgo.com/html/ for real search results
 * Used as last-resort fallback when no API keys are configured
 */

interface DDGSearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface DDGSearchResponse {
  success: boolean;
  results: DDGSearchResult[];
  error?: string;
}

/**
 * Search DuckDuckGo by scraping the HTML search page
 * Returns real search results (not just Instant Answer Wikipedia summaries)
 */
export async function searchDDGHtml(query: string): Promise<DDGSearchResponse> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodedQuery}`,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`DDG HTML returned ${response.status}`);
    }

    const html = await response.text();
    const results = parseResults(html);

    return { success: results.length > 0, results: results.slice(0, 5) };
  } catch (error) {
    console.error('[DDG-HTML] Error:', error);
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'DDG HTML search failed',
    };
  }
}

/**
 * Parse search results from DDG HTML response
 */
function parseResults(html: string): DDGSearchResult[] {
  const results: DDGSearchResult[] = [];

  // Match result blocks: each result is in a div with class "result"
  // Title is in <a class="result__a"> and snippet in <a class="result__snippet">
  const resultBlocks = html.split(/class="result\s/);

  for (let i = 1; i < resultBlocks.length && results.length < 5; i++) {
    const block = resultBlocks[i];

    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

    // Extract URL from result__url or href
    const urlMatch = block.match(/class="result__url"[^>]*href="([^"]*)"/) ||
                     block.match(/class="result__a"[^>]*href="([^"]*)"/);
    let url = urlMatch ? urlMatch[1].trim() : '';

    // DDG uses redirect URLs, extract the actual URL
    const uddgMatch = url.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }
    if (url && !url.startsWith('http')) {
      url = 'https://' + url;
    }

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    let snippet = snippetMatch ? snippetMatch[1].trim() : '';
    // Strip HTML tags from snippet
    snippet = snippet.replace(/<[^>]+>/g, '');
    snippet = decodeHtmlEntities(snippet);

    if (title && snippet) {
      results.push({ title, snippet, url });
    }
  }

  return results;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
