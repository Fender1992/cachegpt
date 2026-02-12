/**
 * Context Retriever for Integration Documents
 * Query-time RAG: generates query embedding, searches integration_documents, formats results.
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/embeddings';
import { formatGitHubContext } from '@/lib/context-formatters';
import type { IntegrationSearchResult } from './types';

const SIMILARITY_THRESHOLD = 0.7;
const MAX_RESULTS = 5;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Retrieve relevant context from user integrations for a given query.
 * Returns formatted markdown string or null if no relevant results.
 */
export async function retrieveRelevantContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Check if user has any active integrations
  const { data: integrations } = await supabase
    .from('user_integrations')
    .select('id, provider')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!integrations || integrations.length === 0) {
    return null;
  }

  // Generate embedding for the query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(queryText);
  } catch {
    console.error('[IntegrationContext] Failed to generate query embedding');
    return null;
  }

  // Search for relevant documents using the SQL function
  const { data: results, error } = await supabase.rpc('search_user_integrations', {
    p_user_id: userId,
    p_query_embedding: `[${queryEmbedding.join(',')}]`,
    p_threshold: SIMILARITY_THRESHOLD,
    p_limit: MAX_RESULTS,
    p_provider_filter: null,
  });

  if (error || !results || results.length === 0) {
    return null;
  }

  const chunks: IntegrationSearchResult[] = results;

  return formatGitHubContext(chunks);
}
