/**
 * Context Retriever for GitHub Integration
 * On-demand: fetches the repo tree, matches files by path/name against
 * the user's query keywords, then retrieves relevant file contents.
 * No pre-indexing or GitHub Code Search API required.
 */

import { createClient } from '@supabase/supabase-js';

const GITHUB_API = 'https://api.github.com';
const MAX_MATCHED_FILES = 5;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_CONTENT_CHARS = 3000; // per file, to keep context window manageable
const MAX_REPOS = 5; // only search most recently pushed repos

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.next', 'build', 'coverage',
  '__pycache__', '.cache', '.vercel', '.husky',
]);

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json', '.yaml', '.yml',
  '.rs', '.go', '.css', '.sql', '.sh', '.toml',
]);

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Extract meaningful search keywords from a user query.
 */
function extractSearchTerms(query: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
    'they', 'them', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
    'and', 'or', 'not', 'but', 'if', 'then', 'so', 'because',
    'show', 'tell', 'explain', 'find', 'look', 'help', 'please', 'using',
    'want', 'like', 'make', 'work', 'works', 'working',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s\-_.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
}

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

/**
 * Score how relevant a file path is to the search terms.
 * Higher score = more relevant. Supports bidirectional partial matching
 * so "authentication" matches files containing "auth" and vice versa.
 */
function scoreFile(filePath: string, terms: string[]): number {
  const lowerPath = filePath.toLowerCase();
  const parts = lowerPath.split('/');
  const fileName = parts[parts.length - 1];
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  // Split filename into tokens (e.g. "unified-auth-resolver" -> ["unified","auth","resolver"])
  const fileTokens = nameWithoutExt.split(/[-_.]/).filter(t => t.length > 1);

  let score = 0;
  for (const term of terms) {
    // Exact filename match (highest value)
    if (nameWithoutExt === term) { score += 10; continue; }
    // Filename contains term
    if (fileName.includes(term)) { score += 5; continue; }
    // Path segment matches term exactly
    if (parts.some(p => p === term)) { score += 4; continue; }
    // Path contains term as substring
    if (lowerPath.includes(term)) { score += 2; continue; }

    // Bidirectional partial: file token starts with term or term starts with token
    // e.g. "auth" in filename matches "authentication" query, or "authentication" matches "auth"
    const hasPartialMatch = fileTokens.some(ft =>
      (ft.length >= 3 && term.startsWith(ft)) ||
      (term.length >= 3 && ft.startsWith(term))
    );
    if (hasPartialMatch) { score += 3; continue; }

    // Weaker: any path component contains a 3+ char prefix of the term
    const prefix = term.slice(0, Math.max(3, Math.min(term.length, 5)));
    if (lowerPath.includes(prefix)) { score += 1; }
  }

  return score;
}

/**
 * Check if a file should be considered for matching.
 */
function isIndexableFile(path: string, size?: number): boolean {
  if (size && size > MAX_FILE_SIZE) return false;

  const parts = path.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return false;
  }

  const fileName = parts[parts.length - 1];
  if (fileName.startsWith('.')) return false;

  const ext = '.' + fileName.split('.').pop();
  return INDEXABLE_EXTENSIONS.has(ext);
}

async function githubFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
}

/**
 * Retrieve relevant context from user's GitHub repos on-demand.
 * Fetches repo trees, scores files by path relevance, fetches top matches.
 * Returns formatted markdown string or null if no relevant results.
 */
export async function retrieveRelevantContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Get user's GitHub integration
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
  const terms = extractSearchTerms(queryText);

  if (terms.length === 0) {
    return null;
  }

  try {
    // Fetch user's recent repos
    const reposRes = await githubFetch(
      `${GITHUB_API}/user/repos?sort=pushed&per_page=${MAX_REPOS}&type=owner`,
      token
    );
    if (!reposRes.ok) return null;
    const repos: Array<{ full_name: string; default_branch: string }> = await reposRes.json();

    // Check if a specific repo is mentioned in the query
    const mentionedRepo = repos.find(r => {
      const repoName = r.full_name.split('/')[1].toLowerCase();
      return terms.some(t => repoName.includes(t) || t.includes(repoName));
    });

    // If a repo is mentioned, only search that one; otherwise search all
    const reposToSearch = mentionedRepo ? [mentionedRepo] : repos;

    // Collect scored files across repos
    const scoredFiles: Array<{
      repo: string;
      path: string;
      score: number;
      branch: string;
    }> = [];

    for (const repo of reposToSearch) {
      const treeRes = await githubFetch(
        `${GITHUB_API}/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`,
        token
      );
      if (!treeRes.ok) continue;

      const treeData = await treeRes.json();
      const files: TreeItem[] = treeData.tree || [];

      for (const file of files) {
        if (file.type !== 'blob' || !isIndexableFile(file.path, file.size)) continue;

        const score = scoreFile(file.path, terms);
        if (score > 0) {
          scoredFiles.push({
            repo: repo.full_name,
            path: file.path,
            score,
            branch: repo.default_branch,
          });
        }
      }
    }

    if (scoredFiles.length === 0) {
      return null;
    }

    // Sort by score descending, take top matches
    scoredFiles.sort((a, b) => b.score - a.score);
    const topFiles = scoredFiles.slice(0, MAX_MATCHED_FILES);

    // Fetch file contents in parallel
    const fileResults = await Promise.all(
      topFiles.map(async (file) => {
        try {
          const contentRes = await githubFetch(
            `${GITHUB_API}/repos/${file.repo}/contents/${file.path}?ref=${file.branch}`,
            token
          );
          if (!contentRes.ok) return null;

          const contentData = await contentRes.json();
          if (!contentData.content) return null;

          const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
          const ext = '.' + file.path.split('.').pop();

          return {
            source_id: `${file.repo}/${file.path}`,
            title: file.path,
            content: content.length > MAX_CONTENT_CHARS
              ? content.slice(0, MAX_CONTENT_CHARS) + '\n// ... truncated'
              : content,
            metadata: {
              repo: file.repo,
              extension: ext,
            },
            similarity: file.score,
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

    const { formatGitHubContext } = await import('@/lib/context-formatters');
    return formatGitHubContext(chunks);
  } catch (error) {
    console.error('[GitHubContext] On-demand fetch error:', error);
    return null;
  }
}
