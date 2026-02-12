/**
 * Enhanced Context Retriever for GitHub Integration
 * Supports repository listing, intent detection, code search, and improved file matching
 */

import { createClient } from '@supabase/supabase-js';

const GITHUB_API = 'https://api.github.com';
const MAX_MATCHED_FILES = 10; // Increased from 5
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_CONTENT_CHARS = 3000;
const MAX_REPOS_SEARCH = 10; // Increased from 5
const MAX_REPOS_LIST = 100; // For listing all repos

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.next', 'build', 'coverage',
  '__pycache__', '.cache', '.vercel', '.husky',
]);

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json', '.yaml', '.yml',
  '.rs', '.go', '.css', '.sql', '.sh', '.toml', '.env', '.config',
]);

// High-value keywords that warrant using GitHub Code Search API
const HIGH_VALUE_KEYWORDS = new Set([
  'function', 'class', 'interface', 'component', 'hook', 'service',
  'authentication', 'auth', 'login', 'oauth', 'jwt', 'token',
  'database', 'connection', 'query', 'model', 'schema',
  'api', 'endpoint', 'route', 'controller', 'middleware',
  'config', 'configuration', 'settings', 'environment',
  'error', 'exception', 'bug', 'issue', 'problem',
  'test', 'spec', 'mock', 'fixture', 'jest', 'vitest',
]);

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

interface QueryAnalysis {
  intent: 'list_repos' | 'search_code' | 'find_files' | 'general';
  searchTerms: string[];
  isHighValue: boolean;
  specificRepo?: string;
  language?: string;
  fileType?: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  topics?: string[];
}

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
  sha: string;
}

interface CodeSearchResult {
  name: string;
  path: string;
  repository: {
    full_name: string;
    default_branch: string;
  };
  html_url: string;
  score: number;
}

/**
 * Analyze query to determine intent and extract relevant information
 */
function analyzeQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  
  // Determine intent
  let intent: QueryAnalysis['intent'] = 'general';
  
  // Check for repository listing intent
  if (/what.*repos.*(?:can|do).*(?:see|have|access)|list.*(?:all.*)?repos|show.*repositories|my.*repos/i.test(query)) {
    intent = 'list_repos';
  }
  // Check for code search intent
  else if (/(?:find|search|look for|locate|where).*(?:function|class|method|component|code|implementation)/i.test(query)) {
    intent = 'search_code';
  }
  // Check for file search intent
  else if (/(?:find|show|where|locate).*(?:file|document)|file.*(?:called|named)/i.test(query)) {
    intent = 'find_files';
  }
  
  // Extract search terms
  const searchTerms = extractSearchTerms(query);
  
  // Check if query contains high-value keywords
  const isHighValue = searchTerms.some(term => HIGH_VALUE_KEYWORDS.has(term));
  
  // Detect specific repository mention
  const repoPattern = /(?:in|from|of)\s+(?:repo(?:sitory)?|project)\s+(\S+)/i;
  const repoMatch = query.match(repoPattern);
  const specificRepo = repoMatch ? repoMatch[1] : undefined;
  
  // Detect language specification
  const langPattern = /(?:in|using|with)\s+(?:language\s+)?(\w+)(?:\s+code|\s+files)?/i;
  const langMatch = query.match(langPattern);
  const language = langMatch && ['javascript', 'typescript', 'python', 'go', 'rust', 'java'].includes(langMatch[1].toLowerCase()) 
    ? langMatch[1].toLowerCase() 
    : undefined;
  
  // Detect file type
  const fileTypePattern = /\.(ts|tsx|js|jsx|py|md|json|yaml|yml|sql|go|rs|css|scss|html)(?:\s|$)/i;
  const fileTypeMatch = query.match(fileTypePattern);
  const fileType = fileTypeMatch ? fileTypeMatch[1].toLowerCase() : undefined;
  
  return {
    intent,
    searchTerms,
    isHighValue,
    specificRepo,
    language,
    fileType,
  };
}

/**
 * Extract meaningful search keywords from a user query
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
    'want', 'like', 'make', 'work', 'works', 'working', 'see', 'all',
    'repos', 'repositories', 'github', 'code', 'file', 'files',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s\-_.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
}

/**
 * Score file relevance with improved matching
 */
function scoreFile(filePath: string, terms: string[], analysis: QueryAnalysis): number {
  const lowerPath = filePath.toLowerCase();
  const parts = lowerPath.split('/');
  const fileName = parts[parts.length - 1];
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  const fileTokens = nameWithoutExt.split(/[-_.]/).filter(t => t.length > 1);
  
  let score = 0;
  
  // Boost score if file type matches
  if (analysis.fileType) {
    const ext = fileName.split('.').pop();
    if (ext === analysis.fileType) score += 8;
  }
  
  for (const term of terms) {
    // Exact filename match (highest value)
    if (nameWithoutExt === term) { 
      score += 10; 
      continue; 
    }
    
    // Filename contains term
    if (fileName.includes(term)) { 
      score += 5; 
      continue; 
    }
    
    // Path segment matches term exactly
    if (parts.some(p => p === term)) { 
      score += 4; 
      continue; 
    }
    
    // Path contains term as substring
    if (lowerPath.includes(term)) { 
      score += 2; 
      continue; 
    }

    // Bidirectional partial matching
    const hasPartialMatch = fileTokens.some(ft =>
      (ft.length >= 3 && term.startsWith(ft)) ||
      (term.length >= 3 && ft.startsWith(term))
    );
    if (hasPartialMatch) { 
      score += 3; 
      continue; 
    }

    // Fuzzy matching for common patterns
    const prefix = term.slice(0, Math.max(3, Math.min(term.length, 5)));
    if (lowerPath.includes(prefix)) { 
      score += 1; 
    }
  }
  
  // Boost for common important files
  if (/^(index|main|app|config|setup|init)\.(ts|js|tsx|jsx)$/.test(fileName)) {
    score += 2;
  }
  
  // Boost for likely relevant directories
  if (parts.some(p => ['src', 'lib', 'components', 'api', 'utils', 'services'].includes(p))) {
    score += 1;
  }
  
  return score;
}

/**
 * Check if file should be indexed
 */
function isIndexableFile(path: string, size?: number): boolean {
  if (size && size > MAX_FILE_SIZE) return false;

  const parts = path.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return false;
  }

  const fileName = parts[parts.length - 1];
  if (fileName.startsWith('.') && fileName !== '.env' && fileName !== '.env.example') {
    return false;
  }

  const ext = '.' + fileName.split('.').pop();
  return INDEXABLE_EXTENSIONS.has(ext);
}

async function githubFetch(url: string, token: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  
  // Handle rate limiting
  if (response.status === 403 || response.status === 429) {
    const resetHeader = response.headers.get('x-ratelimit-reset');
    if (resetHeader) {
      const resetTime = parseInt(resetHeader, 10) * 1000;
      const waitMs = Math.max(resetTime - Date.now(), 0) + 1000;
      if (waitMs <= 60_000) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return githubFetch(url, token);
      }
    }
  }
  
  return response;
}

/**
 * List all user repositories without keyword matching
 */
async function listAllRepositories(
  token: string
): Promise<{ repos: GitHubRepo[]; totalCount: number } | null> {
  try {
    const allRepos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;
    
    // Fetch all pages of repositories
    while (allRepos.length < 500) { // Reasonable limit
      const response = await githubFetch(
        `${GITHUB_API}/user/repos?sort=pushed&per_page=${perPage}&page=${page}&type=owner`,
        token
      );
      
      if (!response.ok) break;
      
      const repos = await response.json();
      if (!repos.length) break;
      
      allRepos.push(...repos);
      
      // Check if there are more pages
      const linkHeader = response.headers.get('link');
      if (!linkHeader || !linkHeader.includes('rel="next"')) break;
      
      page++;
    }
    
    return { repos: allRepos, totalCount: allRepos.length };
  } catch (error) {
    console.error('[GitHubContext] Error listing repositories:', error);
    return null;
  }
}

/**
 * Search code using GitHub Code Search API (rate-limited, use sparingly)
 */
async function searchCodeContent(
  token: string,
  query: string,
  analysis: QueryAnalysis
): Promise<CodeSearchResult[] | null> {
  try {
    // Build search query with qualifiers
    let searchQuery = analysis.searchTerms.join(' ');
    
    // Add language qualifier if detected
    if (analysis.language) {
      searchQuery += ` language:${analysis.language}`;
    }
    
    // Add file type qualifier if detected
    if (analysis.fileType) {
      searchQuery += ` extension:${analysis.fileType}`;
    }
    
    // Limit to user's repositories
    searchQuery += ' user:@me';
    
    const response = await githubFetch(
      `${GITHUB_API}/search/code?q=${encodeURIComponent(searchQuery)}&per_page=10`,
      token
    );
    
    if (!response.ok) {
      // If rate limited or error, return null to fall back to path search
      return null;
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('[GitHubContext] Code search error:', error);
    return null;
  }
}

/**
 * Format repository list as context
 */
function formatRepositoryList(repos: GitHubRepo[]): string {
  const lines = ['## Your GitHub Repositories\n'];
  
  // Group by language
  const byLanguage = new Map<string, GitHubRepo[]>();
  const noLanguage: GitHubRepo[] = [];
  
  repos.forEach(repo => {
    const lang = repo.language || 'Other';
    if (!repo.language) {
      noLanguage.push(repo);
    } else {
      if (!byLanguage.has(lang)) {
        byLanguage.set(lang, []);
      }
      byLanguage.get(lang)!.push(repo);
    }
  });
  
  // Sort languages by repo count
  const sortedLanguages = Array.from(byLanguage.entries())
    .sort((a, b) => b[1].length - a[1].length);
  
  // Format each language group
  sortedLanguages.forEach(([language, langRepos]) => {
    lines.push(`\n### ${language} (${langRepos.length})\n`);
    langRepos.slice(0, 10).forEach(repo => {
      const stars = repo.stargazers_count > 0 ? ` ⭐${repo.stargazers_count}` : '';
      const desc = repo.description ? ` - ${repo.description.slice(0, 60)}` : '';
      lines.push(`- **${repo.name}**${stars}${desc}`);
    });
    if (langRepos.length > 10) {
      lines.push(`- ... and ${langRepos.length - 10} more ${language} repositories`);
    }
  });
  
  // Add repositories without language
  if (noLanguage.length > 0) {
    lines.push(`\n### Other (${noLanguage.length})\n`);
    noLanguage.slice(0, 5).forEach(repo => {
      const desc = repo.description ? ` - ${repo.description.slice(0, 60)}` : '';
      lines.push(`- **${repo.name}**${desc}`);
    });
    if (noLanguage.length > 5) {
      lines.push(`- ... and ${noLanguage.length - 5} more repositories`);
    }
  }
  
  lines.push(`\n**Total: ${repos.length} repositories**`);
  
  return lines.join('\n');
}

/**
 * Main enhanced context retrieval function
 */
export async function retrieveEnhancedContext(
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

  if (!integration?.access_token) {
    return null;
  }

  const token = integration.access_token;
  const analysis = analyzeQuery(queryText);
  
  // Handle repository listing intent
  if (analysis.intent === 'list_repos') {
    const result = await listAllRepositories(token);
    if (result && result.repos.length > 0) {
      return formatRepositoryList(result.repos);
    }
    return 'No repositories found or unable to fetch repository list.';
  }
  
  // For code search or high-value queries, try GitHub Code Search first
  if ((analysis.intent === 'search_code' || analysis.isHighValue) && analysis.searchTerms.length > 0) {
    const codeResults = await searchCodeContent(token, queryText, analysis);
    
    if (codeResults && codeResults.length > 0) {
      // Format code search results
      const chunks = await Promise.all(
        codeResults.slice(0, 5).map(async (result) => {
          try {
            const contentRes = await githubFetch(
              `${GITHUB_API}/repos/${result.repository.full_name}/contents/${result.path}?ref=${result.repository.default_branch}`,
              token
            );
            
            if (!contentRes.ok) return null;
            
            const contentData = await contentRes.json();
            if (!contentData.content) return null;
            
            const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
            
            return {
              source_id: `${result.repository.full_name}/${result.path}`,
              title: result.path,
              content: content.length > MAX_CONTENT_CHARS
                ? content.slice(0, MAX_CONTENT_CHARS) + '\n// ... truncated'
                : content,
              metadata: {
                repo: result.repository.full_name,
                score: result.score,
              },
              similarity: result.score,
            };
          } catch {
            return null;
          }
        })
      );
      
      const validChunks = chunks.filter(Boolean);
      if (validChunks.length > 0) {
        const { formatGitHubContext } = await import('@/lib/context-formatters');
        return formatGitHubContext(validChunks as any);
      }
    }
  }
  
  // Fall back to path-based search
  if (analysis.searchTerms.length === 0) {
    return null;
  }
  
  try {
    // Fetch repositories
    const reposRes = await githubFetch(
      `${GITHUB_API}/user/repos?sort=pushed&per_page=${MAX_REPOS_SEARCH}&type=owner`,
      token
    );
    
    if (!reposRes.ok) return null;
    const repos: GitHubRepo[] = await reposRes.json();
    
    // Check for specific repository mention
    const mentionedRepo = repos.find(r => {
      const repoName = r.full_name.split('/')[1].toLowerCase();
      return analysis.specificRepo && 
        (repoName.includes(analysis.specificRepo.toLowerCase()) || 
         analysis.specificRepo.toLowerCase().includes(repoName));
    });
    
    const reposToSearch = mentionedRepo ? [mentionedRepo] : repos;
    
    // Collect and score files
    const scoredFiles: Array<{
      repo: string;
      path: string;
      score: number;
      branch: string;
      sha: string;
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
        
        const score = scoreFile(file.path, analysis.searchTerms, analysis);
        if (score > 0) {
          scoredFiles.push({
            repo: repo.full_name,
            path: file.path,
            score,
            branch: repo.default_branch,
            sha: file.sha,
          });
        }
      }
    }
    
    if (scoredFiles.length === 0) {
      return null;
    }
    
    // Sort by score and take top matches
    scoredFiles.sort((a, b) => b.score - a.score);
    const topFiles = scoredFiles.slice(0, MAX_MATCHED_FILES);
    
    // Fetch file contents
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
    console.error('[GitHubContext] Enhanced retrieval error:', error);
    return null;
  }
}

// Export original function name for backward compatibility
export { retrieveEnhancedContext as retrieveRelevantContext };