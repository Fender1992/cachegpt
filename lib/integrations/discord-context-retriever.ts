/**
 * Discord Context Retriever
 * Retrieves relevant Discord messages based on user queries
 * Supports both semantic search and keyword matching
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/embeddings';

const MAX_RESULTS = 10;
const SIMILARITY_THRESHOLD = 0.7;

interface DiscordSearchResult {
  id: string;
  source_id: string;
  title: string | null;
  content: string;
  metadata: {
    guild_id: string;
    guild_name: string;
    channel_id: string;
    channel_name: string;
    channel_type: number;
    message_count?: number;
    authors?: string[];
    timestamp_start?: string;
    timestamp_end?: string;
  };
  similarity: number;
}

interface QueryAnalysis {
  intent: 'search_messages' | 'find_conversation' | 'list_servers' | 'general';
  searchTerms: string[];
  timeframe?: {
    start?: Date;
    end?: Date;
    relative?: 'today' | 'yesterday' | 'this week' | 'last week' | 'this month';
  };
  guildName?: string;
  channelName?: string;
  authorName?: string;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * Analyze query to understand user intent
 */
function analyzeDiscordQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  
  // Determine intent
  let intent: QueryAnalysis['intent'] = 'general';
  
  if (/(?:what|which).*(?:server|guild)s?.*(?:have|connected|linked)/i.test(query)) {
    intent = 'list_servers';
  } else if (/(?:find|search|look for).*(?:message|conversation|discussion)/i.test(query)) {
    intent = 'search_messages';
  } else if (/(?:what|show).*(?:said|discussed|talked about)/i.test(query)) {
    intent = 'find_conversation';
  }
  
  // Extract time references
  let timeframe: QueryAnalysis['timeframe'] | undefined;
  if (lowerQuery.includes('today')) {
    timeframe = { relative: 'today' };
  } else if (lowerQuery.includes('yesterday')) {
    timeframe = { relative: 'yesterday' };
  } else if (lowerQuery.includes('this week')) {
    timeframe = { relative: 'this week' };
  } else if (lowerQuery.includes('last week')) {
    timeframe = { relative: 'last week' };
  } else if (lowerQuery.includes('this month')) {
    timeframe = { relative: 'this month' };
  }
  
  // Extract server/channel references
  const serverMatch = query.match(/(?:in|from|on)\s+(?:server|guild)\s+["\']?([^"'\s]+)["\']?/i);
  const channelMatch = query.match(/(?:in|from|#)\s*([a-zA-Z0-9-_]+)/);
  const authorMatch = query.match(/(?:by|from)\s+@?([a-zA-Z0-9_]+)/i);
  
  // Extract search terms (remove common Discord-related words)
  const stopWords = new Set([
    'discord', 'server', 'guild', 'channel', 'message', 'messages',
    'conversation', 'discussion', 'chat', 'said', 'discussed', 'talked',
    'find', 'search', 'show', 'what', 'where', 'when', 'who',
    'in', 'on', 'at', 'by', 'from', 'about', 'the', 'a', 'an',
    'today', 'yesterday', 'week', 'month', 'this', 'last',
  ]);
  
  const searchTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return {
    intent,
    searchTerms,
    timeframe,
    guildName: serverMatch?.[1],
    channelName: channelMatch?.[1],
    authorName: authorMatch?.[1],
  };
}

/**
 * Format Discord search results as context
 */
function formatDiscordContext(results: DiscordSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant Discord messages found.';
  }
  
  const lines = ['## Discord Context\n'];
  
  // Group by server and channel
  const grouped = new Map<string, Map<string, DiscordSearchResult[]>>();
  
  for (const result of results) {
    const guildKey = `${result.metadata.guild_name}|${result.metadata.guild_id}`;
    const channelKey = `${result.metadata.channel_name}|${result.metadata.channel_id}`;
    
    if (!grouped.has(guildKey)) {
      grouped.set(guildKey, new Map());
    }
    
    const guildGroup = grouped.get(guildKey)!;
    if (!guildGroup.has(channelKey)) {
      guildGroup.set(channelKey, []);
    }
    
    guildGroup.get(channelKey)!.push(result);
  }
  
  // Format grouped results
  for (const [guildKey, channels] of grouped) {
    const [guildName] = guildKey.split('|');
    lines.push(`\n### Server: ${guildName}\n`);
    
    for (const [channelKey, messages] of channels) {
      const [channelName] = channelKey.split('|');
      lines.push(`\n#### #${channelName}\n`);
      
      for (const message of messages) {
        // Add message metadata
        if (message.metadata.timestamp_end) {
          const date = new Date(message.metadata.timestamp_end);
          lines.push(`*${date.toLocaleDateString()} ${date.toLocaleTimeString()}*`);
        }
        
        if (message.metadata.authors && message.metadata.authors.length > 0) {
          lines.push(`**Participants:** ${message.metadata.authors.join(', ')}`);
        }
        
        // Add message content (limited to prevent context overflow)
        const contentLines = message.content.split('\n').slice(0, 20);
        lines.push('```');
        lines.push(...contentLines);
        if (message.content.split('\n').length > 20) {
          lines.push('... (truncated)');
        }
        lines.push('```\n');
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * List all Discord servers/guilds
 */
async function listDiscordServers(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  
  // Get user's Discord integration
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_data')
    .eq('user_id', userId)
    .eq('provider', 'discord')
    .eq('status', 'active')
    .single();
  
  if (!integration) {
    return null;
  }
  
  // Get guild metadata
  const { data: guilds } = await supabase
    .from('discord_guild_metadata')
    .select('*')
    .eq('integration_id', integration.id)
    .order('guild_name');
  
  if (!guilds || guilds.length === 0) {
    return 'No Discord servers connected or synced yet.';
  }
  
  // Get channel counts for each guild
  const { data: channelCounts } = await supabase
    .from('discord_channel_metadata')
    .select('guild_id')
    .eq('integration_id', integration.id);
  
  const channelCountMap = new Map<string, number>();
  channelCounts?.forEach(c => {
    const count = channelCountMap.get(c.guild_id) || 0;
    channelCountMap.set(c.guild_id, count + 1);
  });
  
  const lines = ['## Your Discord Servers\n'];
  
  for (const guild of guilds) {
    const channelCount = channelCountMap.get(guild.guild_id) || 0;
    lines.push(`### ${guild.guild_name}`);
    
    if (guild.description) {
      lines.push(`*${guild.description}*`);
    }
    
    lines.push(`- **Channels synced:** ${channelCount}`);
    
    if (guild.member_count) {
      lines.push(`- **Members:** ${guild.member_count}`);
    }
    
    if (guild.features && guild.features.length > 0) {
      const features = (guild.features as string[])
        .map(f => f.toLowerCase().replace(/_/g, ' '))
        .join(', ');
      lines.push(`- **Features:** ${features}`);
    }
    
    lines.push('');
  }
  
  const userData = integration.provider_data as any;
  if (userData?.username) {
    lines.push(`\n**Discord User:** ${userData.username}${userData.discriminator ? `#${userData.discriminator}` : ''}`);
  }
  
  lines.push(`**Total Servers:** ${guilds.length}`);
  
  return lines.join('\n');
}

/**
 * Apply timeframe filter to search
 */
function getTimeframeFilter(timeframe: QueryAnalysis['timeframe']): string | null {
  if (!timeframe) return null;
  
  const now = new Date();
  let startDate: Date;
  
  switch (timeframe.relative) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'yesterday':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      break;
    case 'this week':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      break;
    case 'last week':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
      break;
    case 'this month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      return null;
  }
  
  return startDate.toISOString();
}

/**
 * Main Discord context retrieval function
 */
export async function retrieveDiscordContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  
  // Get user's Discord integration
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'discord')
    .eq('status', 'active')
    .single();
  
  if (!integration) {
    return null;
  }
  
  const analysis = analyzeDiscordQuery(queryText);
  
  // Handle server listing intent
  if (analysis.intent === 'list_servers') {
    return listDiscordServers(userId);
  }
  
  // If no search terms, return null
  if (analysis.searchTerms.length === 0 && !analysis.guildName && !analysis.channelName) {
    return null;
  }
  
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(queryText);
    
    // Build search query
    let searchQuery = supabase
      .from('integration_documents')
      .select(`
        id,
        source_id,
        title,
        content,
        metadata,
        chunk_index
      `)
      .eq('integration_id', integration.id)
      .eq('provider', 'discord')
      .order('updated_at', { ascending: false })
      .limit(MAX_RESULTS);
    
    // Apply filters based on analysis
    if (analysis.guildName) {
      searchQuery = searchQuery.ilike('metadata->>guild_name', `%${analysis.guildName}%`);
    }
    
    if (analysis.channelName) {
      searchQuery = searchQuery.ilike('metadata->>channel_name', `%${analysis.channelName}%`);
    }
    
    if (analysis.authorName) {
      searchQuery = searchQuery.contains('metadata->authors', [analysis.authorName]);
    }
    
    // Apply timeframe filter
    const timeframeStart = getTimeframeFilter(analysis.timeframe);
    if (timeframeStart) {
      searchQuery = searchQuery.gte('metadata->>timestamp_end', timeframeStart);
    }
    
    // Apply text search for keywords
    if (analysis.searchTerms.length > 0) {
      const searchPattern = analysis.searchTerms.join(' | ');
      searchQuery = searchQuery.or(`content.ilike.%${searchPattern}%,title.ilike.%${searchPattern}%`);
    }
    
    const { data: results, error } = await searchQuery;
    
    if (error || !results || results.length === 0) {
      // Try semantic search if keyword search fails
      const { data: semanticResults } = await supabase.rpc('search_discord_context', {
        p_user_id: userId,
        p_query_text: analysis.searchTerms.join(' '),
        p_query_embedding: queryEmbedding,
        p_guild_id: analysis.guildName || null,
        p_channel_id: analysis.channelName || null,
        p_limit: MAX_RESULTS,
      });
      
      if (semanticResults && semanticResults.length > 0) {
        return formatDiscordContext(semanticResults as DiscordSearchResult[]);
      }
      
      return null;
    }
    
    // Format results with metadata
    const formattedResults: DiscordSearchResult[] = results.map(r => ({
      id: r.id,
      source_id: r.source_id,
      title: r.title,
      content: r.content,
      metadata: r.metadata as any,
      similarity: 1.0, // Keyword match gets max similarity
    }));
    
    return formatDiscordContext(formattedResults);
  } catch (error) {
    console.error('[Discord Context] Error retrieving context:', error);
    return null;
  }
}

// Export for backward compatibility
export { retrieveDiscordContext as retrieveRelevantContext };