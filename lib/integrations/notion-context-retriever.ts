/**
 * Notion Context Retriever
 * Searches Notion pages and content on demand via Notion API
 * No pre-sync or embeddings — queries Notion live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidNotionToken } from '@/lib/notion/notion-token';

const MAX_RESULTS = 8;
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

interface NotionSearchResult {
  id: string;
  title: string;
  type: 'page' | 'database';
  content: string;
  url: string;
  lastEdited: string;
}

interface QueryAnalysis {
  intent: 'search_notes' | 'find_page' | 'find_database' | 'general';
  searchTerms: string[];
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to understand user intent for Notion
 */
export function analyzeNotionQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();

  let intent: QueryAnalysis['intent'] = 'general';

  if (/(?:notion|note|notes|page|pages|doc|docs|document|documents|wiki)/i.test(query)) {
    intent = 'search_notes';
  } else if (/(?:find|search|look for).*(?:note|page|doc|document)/i.test(query)) {
    intent = 'find_page';
  } else if (/(?:database|table|board|list|gallery).*(?:in|on|from)\s*notion/i.test(query)) {
    intent = 'find_database';
  } else if (/(?:wrote|documented|noted|recorded|saved).*(?:in|on)\s*notion/i.test(query)) {
    intent = 'search_notes';
  }

  // Extract search terms
  const stopWords = new Set([
    'notion', 'note', 'notes', 'page', 'pages', 'doc', 'docs',
    'document', 'documents', 'wiki', 'database', 'table',
    'find', 'search', 'look', 'show', 'get', 'list', 'for',
    'what', 'where', 'when', 'who', 'how', 'which',
    'did', 'does', 'has', 'have', 'had', 'was', 'were',
    'in', 'on', 'at', 'by', 'from', 'about', 'the', 'a', 'an',
    'my', 'i', 'me', 'to', 'and', 'or', 'but', 'with', 'that', 'this',
    'wrote', 'documented', 'noted', 'recorded', 'saved',
  ]);

  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return {
    intent,
    searchTerms,
  };
}

/**
 * Extract text content from Notion blocks
 */
function extractBlocksText(blocks: any[]): string {
  return blocks
    .map((block: any) => {
      const type = block.type;
      if (block[type]?.rich_text) {
        return block[type].rich_text.map((t: any) => t.plain_text).join('');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract page title from Notion page object
 */
function extractPageTitle(page: any): string {
  if (page.object === 'database') {
    if (page.title?.length > 0) {
      return page.title.map((t: any) => t.plain_text).join('');
    }
    return 'Untitled Database';
  }

  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

/**
 * Format Notion search results as context
 */
export function formatNotionContext(results: NotionSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant Notion pages found.';
  }

  const lines = ['## Notion Context\n'];

  for (const result of results) {
    lines.push(`\n### ${result.title} (${result.type})\n`);
    lines.push(`*Last edited: ${new Date(result.lastEdited).toLocaleDateString()}*\n`);

    if (result.content) {
      const truncated = result.content.split('\n').slice(0, 20).join('\n');
      lines.push('```');
      lines.push(truncated);
      if (result.content.split('\n').length > 20) {
        lines.push('... (truncated)');
      }
      lines.push('```\n');
    }
  }

  return lines.join('\n');
}

/**
 * Main Notion context retrieval function
 * Searches Notion pages on demand
 */
export async function retrieveNotionContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'notion')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeNotionQuery(queryText);

  // Only retrieve context for Notion-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  try {
    const token = await getValidNotionToken(
      integration.id,
      integration.access_token
    );

    if (!token) {
      return null;
    }

    // Search Notion
    const searchQuery = analysis.searchTerms.join(' ') || queryText;

    const body: any = {
      query: searchQuery,
      page_size: MAX_RESULTS,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    };

    const searchRes = await fetch(`${NOTION_API}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!searchRes.ok) {
      console.error('[Notion Context] Search failed:', searchRes.status);
      return null;
    }

    const searchData = await searchRes.json();
    const items = searchData.results || [];

    if (items.length === 0) {
      return null;
    }

    // Fetch content for top results
    const results: NotionSearchResult[] = [];

    await Promise.all(
      items.slice(0, MAX_RESULTS).map(async (item: any) => {
        try {
          let content = '';

          // Only fetch blocks for pages (not databases)
          if (item.object === 'page') {
            const blocksRes = await fetch(
              `${NOTION_API}/blocks/${item.id}/children?page_size=50`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Notion-Version': NOTION_VERSION,
                },
                signal: AbortSignal.timeout(5000),
              }
            );

            if (blocksRes.ok) {
              const blocksData = await blocksRes.json();
              content = extractBlocksText(blocksData.results || []);
            }
          }

          results.push({
            id: item.id,
            title: extractPageTitle(item),
            type: item.object,
            content,
            url: item.url || '',
            lastEdited: item.last_edited_time || '',
          });
        } catch (e) {
          console.warn('[Notion Context] Failed to fetch page content', item.id, e);
        }
      })
    );

    if (results.length === 0) {
      return null;
    }

    // Sort by last edited
    results.sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime());

    return formatNotionContext(results);
  } catch (error) {
    console.error('[Notion Context] Error retrieving context:', error);
    return null;
  }
}
