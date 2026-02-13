/**
 * Slack Context Retriever
 * Searches Slack messages on demand via Slack API
 * No pre-sync or embeddings — queries Slack live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidSlackToken } from '@/lib/slack/slack-token';

const MAX_RESULTS = 10;

interface SlackSearchResult {
  channel: string;
  userName: string;
  text: string;
  timestamp: string;
  permalink: string;
}

interface QueryAnalysis {
  intent: 'search_messages' | 'find_channel' | 'general';
  searchTerms: string[];
  channelName?: string;
  userName?: string;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to understand user intent for Slack
 */
export function analyzeSlackQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();

  let intent: QueryAnalysis['intent'] = 'general';

  if (/(?:slack|message|channel|thread|dm|direct message)/i.test(query)) {
    intent = 'search_messages';
  } else if (/(?:said|wrote|posted|mentioned|shared|asked).*(?:in|on)\s+(?:slack|#)/i.test(query)) {
    intent = 'search_messages';
  } else if (/(?:find|search|look for).*(?:slack|message|channel)/i.test(query)) {
    intent = 'search_messages';
  } else if (/#\w+/i.test(query)) {
    intent = 'find_channel';
  }

  // Extract channel name
  const channelMatch = query.match(/#(\w+)/);
  const channelName = channelMatch?.[1];

  // Extract username
  const userMatch = query.match(/@(\w+)/);
  const userName = userMatch?.[1];

  // Extract search terms
  const stopWords = new Set([
    'slack', 'message', 'messages', 'channel', 'channels', 'thread', 'threads',
    'dm', 'direct', 'said', 'wrote', 'posted', 'mentioned', 'shared', 'asked',
    'what', 'when', 'where', 'who', 'how', 'did', 'does', 'has', 'have',
    'find', 'search', 'show', 'look', 'for', 'in', 'on', 'at', 'the',
    'a', 'an', 'my', 'i', 'me', 'to', 'and', 'or', 'but', 'with',
    'about', 'from', 'by', 'this', 'that',
  ]);

  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s@#]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word) && !word.startsWith('#') && !word.startsWith('@'));

  return {
    intent,
    searchTerms,
    channelName,
    userName,
  };
}

/**
 * Format Slack search results as context
 */
export function formatSlackContext(results: SlackSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant Slack messages found.';
  }

  const lines = ['## Slack Context\n'];

  // Group by channel
  const byChannel = new Map<string, SlackSearchResult[]>();
  for (const result of results) {
    const key = result.channel;
    if (!byChannel.has(key)) {
      byChannel.set(key, []);
    }
    byChannel.get(key)!.push(result);
  }

  for (const [channel, messages] of byChannel) {
    lines.push(`\n### #${channel}\n`);

    for (const msg of messages) {
      const date = new Date(msg.timestamp);
      lines.push(`**${msg.userName}** (${date.toLocaleDateString()} ${date.toLocaleTimeString()}):`);
      const truncated = msg.text.split('\n').slice(0, 10).join('\n');
      lines.push('```');
      lines.push(truncated);
      if (msg.text.split('\n').length > 10) {
        lines.push('... (truncated)');
      }
      lines.push('```\n');
    }
  }

  return lines.join('\n');
}

/**
 * Main Slack context retrieval function
 * Searches Slack messages on demand
 */
export async function retrieveSlackContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeSlackQuery(queryText);

  // Only retrieve context for Slack-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  try {
    const token = await getValidSlackToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    // Build search query
    const queryParts: string[] = [];
    if (analysis.channelName) {
      queryParts.push(`in:#${analysis.channelName}`);
    }
    if (analysis.userName) {
      queryParts.push(`from:@${analysis.userName}`);
    }
    if (analysis.searchTerms.length > 0) {
      queryParts.push(analysis.searchTerms.join(' '));
    }

    const searchQuery = queryParts.join(' ') || queryText;

    // Search messages via Slack API
    const searchRes = await fetch(
      `https://slack.com/api/search.messages?query=${encodeURIComponent(searchQuery)}&count=${MAX_RESULTS}&sort=timestamp&sort_dir=desc`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!searchRes.ok) {
      console.error('[Slack Context] Search failed:', searchRes.status);
      return null;
    }

    const searchData = await searchRes.json();

    if (!searchData.ok) {
      console.error('[Slack Context] Search API error:', searchData.error);
      return null;
    }

    const matches = searchData.messages?.matches || [];

    if (matches.length === 0) {
      return null;
    }

    const results: SlackSearchResult[] = matches.slice(0, MAX_RESULTS).map((match: any) => ({
      channel: match.channel?.name || 'unknown',
      userName: match.username || match.user || 'Unknown',
      text: match.text || '',
      timestamp: new Date(parseFloat(match.ts) * 1000).toISOString(),
      permalink: match.permalink || '',
    }));

    return formatSlackContext(results);
  } catch (error) {
    console.error('[Slack Context] Error retrieving context:', error);
    return null;
  }
}
