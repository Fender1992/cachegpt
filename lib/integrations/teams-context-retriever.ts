/**
 * Teams Context Retriever
 * Searches Microsoft Teams messages on demand via Graph API
 * No pre-sync or embeddings — queries Teams live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { getValidTeamsToken } from '@/lib/teams/teams-token';

const MAX_RESULTS = 10;

interface TeamsSearchResult {
  channel: string;
  teamName: string;
  userName: string;
  text: string;
  timestamp: string;
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
 * Analyze query to understand user intent for Teams
 */
export function analyzeTeamsQuery(query: string): QueryAnalysis {
  let intent: QueryAnalysis['intent'] = 'general';

  if (/(?:teams|microsoft teams|team chat|team message|team channel)/i.test(query)) {
    intent = 'search_messages';
  } else if (/(?:said|wrote|posted|mentioned|shared|asked).*(?:in|on)\s+(?:teams|#)/i.test(query)) {
    intent = 'search_messages';
  } else if (/(?:find|search|look for).*(?:teams|team message|team channel)/i.test(query)) {
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
    'teams', 'microsoft', 'message', 'messages', 'channel', 'channels', 'thread', 'threads',
    'chat', 'chats', 'said', 'wrote', 'posted', 'mentioned', 'shared', 'asked',
    'what', 'when', 'where', 'who', 'how', 'did', 'does', 'has', 'have',
    'find', 'search', 'show', 'look', 'for', 'in', 'on', 'at', 'the',
    'a', 'an', 'my', 'i', 'me', 'to', 'and', 'or', 'but', 'with',
    'about', 'from', 'by', 'this', 'that', 'team',
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
 * Format Teams search results as context
 */
export function formatTeamsContext(results: TeamsSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant Teams messages found.';
  }

  const lines = ['## Microsoft Teams Context\n'];

  // Group by team and channel
  const byChannel = new Map<string, TeamsSearchResult[]>();
  for (const result of results) {
    const key = `${result.teamName} > ${result.channel}`;
    if (!byChannel.has(key)) {
      byChannel.set(key, []);
    }
    byChannel.get(key)!.push(result);
  }

  for (const [channel, messages] of byChannel) {
    lines.push(`\n### ${channel}\n`);

    for (const msg of messages) {
      const date = new Date(msg.timestamp);
      lines.push(`**${msg.userName}** (${date.toLocaleDateString()} ${date.toLocaleTimeString()}):`);
      const cleanText = msg.text.replace(/<[^>]*>/g, '').trim();
      const truncated = cleanText.split('\n').slice(0, 10).join('\n');
      lines.push('```');
      lines.push(truncated);
      if (cleanText.split('\n').length > 10) {
        lines.push('... (truncated)');
      }
      lines.push('```\n');
    }
  }

  return lines.join('\n');
}

/**
 * Main Teams context retrieval function
 * Fetches recent messages from joined teams and channels
 */
export async function retrieveTeamsContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'teams')
    .eq('status', 'active')
    .single();

  if (!integration) {
    return null;
  }

  const analysis = analyzeTeamsQuery(queryText);

  // Only retrieve context for Teams-related queries
  if (analysis.intent === 'general' && analysis.searchTerms.length === 0) {
    return null;
  }

  try {
    const token = await getValidTeamsToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return null;
    }

    const results: TeamsSearchResult[] = [];

    // Fetch joined teams
    const teamsRes = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!teamsRes.ok) {
      console.error('[Teams Context] Failed to fetch teams:', teamsRes.status);
      return null;
    }

    const teamsData = await teamsRes.json();
    const joinedTeams = teamsData.value || [];

    // Search through recent channel messages
    for (const team of joinedTeams.slice(0, 5)) {
      try {
        const channelsRes = await fetch(
          `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          }
        );

        if (!channelsRes.ok) continue;

        const channelsData = await channelsRes.json();

        for (const channel of (channelsData.value || []).slice(0, 5)) {
          try {
            const msgsRes = await fetch(
              `https://graph.microsoft.com/v1.0/teams/${team.id}/channels/${channel.id}/messages?$top=10`,
              {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(5000),
              }
            );

            if (!msgsRes.ok) continue;

            const msgsData = await msgsRes.json();

            for (const msg of msgsData.value || []) {
              const text = msg.body?.content || '';
              const cleanText = text.replace(/<[^>]*>/g, '').toLowerCase();

              // Check if message matches search terms
              const matches = analysis.searchTerms.some(term => cleanText.includes(term));
              if (matches || analysis.intent === 'search_messages') {
                results.push({
                  channel: channel.displayName,
                  teamName: team.displayName,
                  userName: msg.from?.user?.displayName || 'Unknown',
                  text: text,
                  timestamp: msg.createdDateTime || new Date().toISOString(),
                });
              }

              if (results.length >= MAX_RESULTS) break;
            }
          } catch {
            // Skip failed message fetches
          }

          if (results.length >= MAX_RESULTS) break;
        }
      } catch {
        // Skip failed channel fetches
      }

      if (results.length >= MAX_RESULTS) break;
    }

    if (results.length === 0) {
      return null;
    }

    return formatTeamsContext(results);
  } catch (error) {
    console.error('[Teams Context] Error retrieving context:', error);
    return null;
  }
}
