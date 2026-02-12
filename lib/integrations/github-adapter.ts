/**
 * GitHub Integration Adapter
 * Fetches repos, chunks files, generates embeddings, and upserts into integration_documents.
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from '@/lib/embeddings';
import crypto from 'crypto';

const GITHUB_API = 'https://api.github.com';

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.json', '.yaml', '.yml', '.rs', '.go',
]);

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.next', 'build', 'coverage', '__pycache__', '.cache',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
]);

const MAX_REPOS = 30;
const MAX_FILES_PER_REPO = 500;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;
const EMBEDDING_BATCH_SIZE = 20;

interface GitHubRepo {
  full_name: string;
  name: string;
  html_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  private: boolean;
}

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
  url: string;
  sha: string;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

async function githubFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function shouldIndexFile(path: string, size?: number): boolean {
  if (size && size > MAX_FILE_SIZE) return false;

  const parts = path.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return false;
  }

  const fileName = parts[parts.length - 1];
  if (SKIP_FILES.has(fileName)) return false;
  if (fileName.startsWith('.')) return false;

  const ext = '.' + fileName.split('.').pop();
  return INDEXABLE_EXTENSIONS.has(ext);
}

function chunkContent(content: string, filePath: string): { text: string; index: number }[] {
  if (content.length <= CHUNK_SIZE) {
    return [{ text: content, index: 0 }];
  }

  const chunks: { text: string; index: number }[] = [];
  let start = 0;
  let index = 0;

  while (start < content.length) {
    const end = Math.min(start + CHUNK_SIZE, content.length);
    let chunkEnd = end;

    // Try to break at a newline for cleaner chunks
    if (end < content.length) {
      const lastNewline = content.lastIndexOf('\n', end);
      if (lastNewline > start + CHUNK_SIZE / 2) {
        chunkEnd = lastNewline + 1;
      }
    }

    const chunkText = content.slice(start, chunkEnd);
    chunks.push({ text: chunkText, index });

    start = chunkEnd - CHUNK_OVERLAP;
    if (start >= content.length) break;
    index++;
  }

  return chunks;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function syncGitHubRepos(
  userId: string,
  integrationId: string,
  accessToken: string
): Promise<{ reposProcessed: number; documentsUpserted: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let documentsUpserted = 0;

  // Update status to syncing
  await supabase
    .from('user_integrations')
    .update({ status: 'syncing', updated_at: new Date().toISOString() })
    .eq('id', integrationId);

  try {
    // Fetch user's repos (sorted by recently pushed)
    const repos: GitHubRepo[] = await githubFetch(
      `${GITHUB_API}/user/repos?sort=pushed&per_page=${MAX_REPOS}&type=owner`,
      accessToken
    );

    // Get existing content hashes to skip unchanged files
    const { data: existingDocs } = await supabase
      .from('integration_documents')
      .select('source_id, content_hash')
      .eq('integration_id', integrationId);

    const existingHashes = new Map<string, string>();
    existingDocs?.forEach(doc => {
      if (doc.content_hash) {
        existingHashes.set(doc.source_id, doc.content_hash);
      }
    });

    for (const repo of repos) {
      try {
        // Get repo tree recursively
        const tree = await githubFetch(
          `${GITHUB_API}/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`,
          accessToken
        );

        const indexableFiles: GitHubTreeItem[] = (tree.tree || [])
          .filter((item: GitHubTreeItem) =>
            item.type === 'blob' && shouldIndexFile(item.path, item.size)
          )
          .slice(0, MAX_FILES_PER_REPO);

        // Process files in batches for embedding
        const pendingChunks: {
          sourceId: string;
          sourceUrl: string;
          title: string;
          text: string;
          chunkIndex: number;
          contentHash: string;
          metadata: Record<string, any>;
        }[] = [];

        for (const file of indexableFiles) {
          const sourceId = `${repo.full_name}/${file.path}`;
          const sourceUrl = `https://github.com/${repo.full_name}/blob/${repo.default_branch}/${file.path}`;

          try {
            // Fetch file content
            const fileData = await githubFetch(
              `${GITHUB_API}/repos/${repo.full_name}/contents/${file.path}?ref=${repo.default_branch}`,
              accessToken
            );

            if (!fileData.content) continue;

            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            const contentHash = sha256(content);

            // Skip if unchanged
            if (existingHashes.get(sourceId) === contentHash) continue;

            const chunks = chunkContent(content, file.path);
            const ext = '.' + file.path.split('.').pop();

            for (const chunk of chunks) {
              pendingChunks.push({
                sourceId,
                sourceUrl,
                title: file.path,
                text: chunk.text,
                chunkIndex: chunk.index,
                contentHash,
                metadata: {
                  repo: repo.full_name,
                  language: repo.language,
                  stars: repo.stargazers_count,
                  branch: repo.default_branch,
                  extension: ext,
                },
              });
            }
          } catch (fileError: any) {
            // Skip individual file errors (too large, binary, etc.)
            continue;
          }
        }

        // Process pending chunks in embedding batches
        for (let i = 0; i < pendingChunks.length; i += EMBEDDING_BATCH_SIZE) {
          const batch = pendingChunks.slice(i, i + EMBEDDING_BATCH_SIZE);
          const texts = batch.map(c => `${c.title}\n\n${c.text}`);

          let embeddings: number[][];
          try {
            embeddings = await generateEmbeddingsBatch(texts);
          } catch {
            // If embedding fails, store without embeddings
            embeddings = batch.map(() => []);
          }

          for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            const embedding = embeddings[j]?.length > 0 ? embeddings[j] : null;

            const { error } = await supabase
              .from('integration_documents')
              .upsert(
                {
                  user_id: userId,
                  integration_id: integrationId,
                  provider: 'github',
                  source_type: 'repo_file',
                  source_id: chunk.sourceId,
                  source_url: chunk.sourceUrl,
                  title: chunk.title,
                  content: chunk.text,
                  chunk_index: chunk.chunkIndex,
                  embedding: embedding ? `[${embedding.join(',')}]` : null,
                  metadata: chunk.metadata,
                  content_hash: chunk.contentHash,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,provider,source_id,chunk_index' }
              );

            if (!error) {
              documentsUpserted++;
            }
          }
        }
      } catch (repoError: any) {
        errors.push(`Error syncing ${repo.full_name}: ${repoError.message}`);
      }
    }

    // Update integration status
    await supabase
      .from('user_integrations')
      .update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    return { reposProcessed: repos.length, documentsUpserted, errors };
  } catch (error: any) {
    await supabase
      .from('user_integrations')
      .update({
        status: 'error',
        provider_data: { sync_error: error.message },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    throw error;
  }
}
