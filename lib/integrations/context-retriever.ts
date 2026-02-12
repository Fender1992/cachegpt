/**
 * Context Retriever for GitHub Integration
 * On-demand: searches user's GitHub repos via the Search API and fetches
 * relevant file contents at query time. No pre-indexing required.
 */

import { createClient } from '@supabase/supabase-js';

const GITHUB_API = 'https://api.github.com';
const MAX_SEARCH_RESULTS = 5;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_CONTENT_CHARS = 3000; // per file, to keep context window manageable

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Extract search keywords from a user query.
 * Strips common filler words so the GitHub code search is more targeted.
 */
function extractSearchTerms(query: string): string {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
    'they', 'them', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
    'and', 'or', 'not', 'but', 'if', 'then', 'so', 'because',
    'show', 'tell', 'explain', 'find', 'look', 'help', 'please',
    'code', 'file', 'function', 'class', 'method', 'repo', 'repository',
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s-_.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));

  // Take up to 5 most meaningful terms
  return words.slice(0, 5).join(' ');
}

interface GitHubSearchItem {
  name: string;
  path: string;
  repository: { full_name: string; default_branch?: string };
  html_url: string;
  score: number;
}

/**
 * Retrieve relevant context from user's GitHub repos on-demand.
 * Uses GitHub Code Search API + file content fetch.
 * Returns formatted markdown string or null if no relevant results.
 */
export async function retrieveRelevantContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Get user's GitHub integration (need access_token + username)
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, provider_user_id')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .eq('status', 'active')
    .single();

  if (!integration?.access_token || !integration?.provider_user_id) {
    return null;
  }

  const token = integration.access_token;
  const username = integration.provider_user_id;
  const searchTerms = extractSearchTerms(queryText);

  if (!searchTerms) {
    return null;
  }

  try {
    // Search code across user's repos
    const searchQuery = `${searchTerms} user:${username}`;
    const searchRes = await fetch(
      `${GITHUB_API}/search/code?q=${encodeURIComponent(searchQuery)}&per_page=${MAX_SEARCH_RESULTS}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!searchRes.ok) {
      console.error(`[GitHubContext] Search API error: ${searchRes.status}`);
      return null;
    }

    const searchData = await searchRes.json();
    const items: GitHubSearchItem[] = searchData.items || [];

    if (items.length === 0) {
      return null;
    }

    // Fetch file contents for top matches (in parallel)
    const fileResults = await Promise.all(
      items.map(async (item) => {
        try {
          const contentRes = await fetch(
            `${GITHUB_API}/repos/${item.repository.full_name}/contents/${item.path}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            }
          );

          if (!contentRes.ok) return null;

          const contentData = await contentRes.json();
          if (!contentData.content || (contentData.size && contentData.size > MAX_FILE_SIZE)) {
            return null;
          }

          const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
          const ext = '.' + item.name.split('.').pop();

          return {
            source_id: `${item.repository.full_name}/${item.path}`,
            title: item.path,
            content: content.length > MAX_CONTENT_CHARS
              ? content.slice(0, MAX_CONTENT_CHARS) + '\n// ... truncated'
              : content,
            metadata: {
              repo: item.repository.full_name,
              extension: ext,
            },
            similarity: item.score,
          };
        } catch {
          return null;
        }
      })
    );

    const chunks = fileResults.filter(Boolean) as Array<{
      source_id: string;
      title: string | null;
      content: string;
      metadata: Record<string, any>;
      similarity: number;
    }>;

    if (chunks.length === 0) {
      return null;
    }

    // Format using the existing formatter
    const { formatGitHubContext } = await import('@/lib/context-formatters');
    return formatGitHubContext(chunks);
  } catch (error) {
    console.error('[GitHubContext] On-demand fetch error:', error);
    return null;
  }
}
