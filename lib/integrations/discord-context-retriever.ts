/**
 * Discord Context Retriever
 * Fetches relevant Discord messages on demand via bot proxy
 * No pre-sync or embeddings — queries Discord live at chat time
 */

import { createClient } from '@supabase/supabase-js';
import { botProxy, BotChannel, BotMessage } from '@/lib/discord/bot-proxy';
import { getValidDiscordToken } from '@/lib/discord/discord-token';

const MAX_RESULTS = 10;
const TOP_CHANNELS = 3;
const MESSAGES_PER_CHANNEL = 50;

const DISCORD_API = 'https://discord.com/api/v10';

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
  intent: 'search_messages' | 'find_conversation' | 'list_servers' | 'send_message' | 'general';
  searchTerms: string[];
  timeframe?: {
    start?: Date;
    end?: Date;
    relative?: 'today' | 'yesterday' | 'this week' | 'last week' | 'this month';
  };
  guildName?: string;
  channelName?: string;
  authorName?: string;
  // Parsed message details for send intents
  parsedMessage?: {
    channelName: string;
    text: string;
    guildName?: string;
  };
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
export function analyzeDiscordQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  
  // Determine intent
  let intent: QueryAnalysis['intent'] = 'general';
  let parsedMessage: QueryAnalysis['parsedMessage'] | undefined;

  // Write intents (check first — most specific)
  if (/(?:send|post|write|say)\s+(?:a\s+)?(?:message\s+)?(?:in|to|on)\s+(?:discord\s+)?#?(\w[\w-]*)/i.test(query) ||
      /(?:message|tell|notify)\s+#?(\w[\w-]*)\s+(?:on|in)\s+discord/i.test(query) ||
      /(?:send|post)\s+(?:in|to)\s+discord/i.test(query)) {
    intent = 'send_message';

    const channelExtract = query.match(/(?:in|to|on)\s+(?:discord\s+)?#?(\w[\w-]*)/i) ||
                           query.match(/(?:message|tell|notify)\s+#?(\w[\w-]*)/i);
    const targetChannel = channelExtract?.[1] || '';

    const textMatch = query.match(/(?:saying|that\s+says?|with\s+(?:the\s+)?(?:message|text)|message:?|:)\s+["\']?(.+)/i);
    const text = textMatch?.[1]?.replace(/["\']$/, '').trim() || '';

    const serverMatch = query.match(/(?:in|on)\s+(?:server|guild)\s+["\']?([^"'\s]+)["\']?/i);

    if (targetChannel) {
      parsedMessage = { channelName: targetChannel, text, guildName: serverMatch?.[1] };
    }
  } else if (/(?:what|which).*(?:server|guild)s?.*(?:have|connected|linked)/i.test(query)) {
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
    parsedMessage,
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
 * Score a channel's relevance to the query based on name and topic
 */
function scoreChannel(channel: BotChannel, searchTerms: string[]): number {
  if (searchTerms.length === 0) return 0;
  const name = channel.name.toLowerCase();
  const topic = (channel.topic || '').toLowerCase();
  let score = 0;
  for (const term of searchTerms) {
    if (name.includes(term)) score += 3;
    if (topic.includes(term)) score += 2;
  }
  // Boost text channels (type 0) over voice/other
  if (channel.type === 0) score += 1;
  return score;
}

/**
 * Score a message's relevance to the query
 */
function scoreMessage(message: BotMessage, searchTerms: string[], authorName?: string): number {
  if (searchTerms.length === 0 && !authorName) return 1; // neutral score when no filter
  const content = message.content.toLowerCase();
  const username = message.author.username.toLowerCase();
  let score = 0;
  for (const term of searchTerms) {
    if (content.includes(term)) score += 2;
  }
  if (authorName && username.includes(authorName.toLowerCase())) score += 3;
  return score;
}

/**
 * Fetch channels via bot proxy, falling back to user OAuth token
 */
async function fetchChannels(
  guildId: string,
  discordUserId: string | null,
  userToken: string | null
): Promise<BotChannel[]> {
  // Try bot proxy first
  const botAvailable = await botProxy.isAvailable();
  if (botAvailable) {
    try {
      return await botProxy.getGuildChannels(guildId, discordUserId || undefined);
    } catch (e) {
      console.warn('[Discord Context] Bot proxy channel fetch failed, trying OAuth fallback', e);
    }
  }

  // Fallback: user's OAuth token via Discord API
  if (userToken) {
    try {
      const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${userToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const channels = await res.json();
        return channels.map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parentId: c.parent_id || null,
          topic: c.topic || null,
          position: c.position || 0,
        }));
      }
    } catch (e) {
      console.warn('[Discord Context] OAuth channel fetch failed', e);
    }
  }

  return [];
}

/**
 * Fetch messages via bot proxy, falling back to user OAuth token
 */
async function fetchMessages(
  channelId: string,
  limit: number,
  userToken: string | null
): Promise<BotMessage[]> {
  // Try bot proxy first
  const botAvailable = await botProxy.isAvailable();
  if (botAvailable) {
    try {
      return await botProxy.getMessages(channelId, { limit });
    } catch (e) {
      console.warn('[Discord Context] Bot proxy message fetch failed, trying OAuth fallback', e);
    }
  }

  // Fallback: user's OAuth token
  if (userToken) {
    try {
      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, {
        headers: { Authorization: `Bearer ${userToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[Discord Context] OAuth message fetch failed', e);
    }
  }

  return [];
}

/**
 * Send a message to a Discord channel (server-side)
 */
async function sendDiscordMessage(
  userId: string,
  integrationId: string,
  providerUserId: string | null,
  userToken: string | null,
  parsedMessage: NonNullable<QueryAnalysis['parsedMessage']>
): Promise<string> {
  if (!parsedMessage.channelName) {
    return '## Discord Action\n\nCould not send message — no channel specified. Ask the user which channel to post in.';
  }
  if (!parsedMessage.text) {
    return '## Discord Action\n\nCould not send message — no message text provided. Ask the user what they want to say.';
  }

  const supabase = getSupabaseAdmin();

  // Get user's guilds
  const { data: guilds } = await supabase
    .from('discord_guild_metadata')
    .select('guild_id, guild_name')
    .eq('integration_id', integrationId)
    .order('guild_name');

  if (!guilds || guilds.length === 0) {
    return '## Discord Action\n\nNo Discord servers found. The user may need to reconnect Discord in Settings.';
  }

  // Filter guilds if specified
  const targetGuilds = parsedMessage.guildName
    ? guilds.filter(g => g.guild_name.toLowerCase().includes(parsedMessage.guildName!.toLowerCase()))
    : guilds;

  // Find the channel across guilds
  for (const guild of targetGuilds) {
    const channels = await fetchChannels(guild.guild_id, providerUserId, userToken);
    const textChannels = channels.filter(c => c.type === 0);
    const targetChannel = textChannels.find(c =>
      c.name.toLowerCase() === parsedMessage.channelName.toLowerCase()
    );

    if (targetChannel) {
      // Try bot proxy first
      const botAvailable = await botProxy.isAvailable();
      if (botAvailable) {
        try {
          await botProxy.sendMessage(targetChannel.id, parsedMessage.text);
          return `## Discord Action\n\nSuccessfully sent message to #${parsedMessage.channelName} in ${guild.guild_name}:\n- **Channel:** #${parsedMessage.channelName}\n- **Server:** ${guild.guild_name}\n- **Message:** ${parsedMessage.text.substring(0, 200)}\n\nConfirm this to the user in a friendly way.`;
        } catch (e) {
          console.warn('[Discord Action] Bot proxy send failed, trying OAuth fallback', e);
        }
      }

      // Fallback: user's OAuth token
      if (userToken) {
        const res = await fetch(`${DISCORD_API}/channels/${targetChannel.id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: parsedMessage.text }),
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          return `## Discord Action\n\nSuccessfully sent message to #${parsedMessage.channelName} in ${guild.guild_name}:\n- **Channel:** #${parsedMessage.channelName}\n- **Server:** ${guild.guild_name}\n- **Message:** ${parsedMessage.text.substring(0, 200)}\n\nConfirm this to the user in a friendly way.`;
        }
      }

      return `## Discord Action\n\nFailed to send message to #${parsedMessage.channelName}. The bot may not have permission to send messages in this channel.`;
    }
  }

  return `## Discord Action\n\nChannel "#${parsedMessage.channelName}" not found in any connected server. Ask the user to specify the correct channel name.`;
}

/**
 * Main Discord context retrieval function
 * Fetches messages on demand from Discord via bot proxy (no pre-sync)
 */
export async function retrieveDiscordContext(
  userId: string,
  queryText: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Get user's Discord integration
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, provider_user_id, access_token, refresh_token, token_expires_at')
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

  // Handle send message intent
  if (analysis.intent === 'send_message') {
    if (analysis.parsedMessage) {
      const userToken = await getValidDiscordToken(
        integration.id,
        integration.access_token,
        integration.refresh_token,
        integration.token_expires_at
      );
      return await sendDiscordMessage(
        userId,
        integration.id,
        integration.provider_user_id,
        userToken,
        analysis.parsedMessage
      );
    }
    return '## Discord Action\n\nThe user wants to send a Discord message but the request is missing details. Ask the user to provide:\n- **Channel** name (e.g., #general)\n- **Message** text\n\nExample: "Send a message in #general on discord saying Hello everyone!"';
  }

  // If no search terms and no specific filters, return null
  if (analysis.searchTerms.length === 0 && !analysis.guildName && !analysis.channelName) {
    return null;
  }

  try {
    // Get a valid OAuth token as fallback
    const userToken = await getValidDiscordToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    // 1. Get user's guilds from lightweight metadata stored at OAuth time
    const { data: guilds } = await supabase
      .from('discord_guild_metadata')
      .select('guild_id, guild_name')
      .eq('integration_id', integration.id)
      .order('guild_name');

    if (!guilds || guilds.length === 0) {
      return null;
    }

    // Filter guilds by name if user specified one
    const targetGuilds = analysis.guildName
      ? guilds.filter(g => g.guild_name.toLowerCase().includes(analysis.guildName!.toLowerCase()))
      : guilds;

    if (targetGuilds.length === 0) {
      return null;
    }

    // 2. Gather and score channels across guilds
    type ScoredChannel = { channel: BotChannel; guildId: string; guildName: string; score: number };
    const scoredChannels: ScoredChannel[] = [];

    // Fetch channels for all target guilds in parallel
    const channelResults = await Promise.all(
      targetGuilds.map(async (g) => {
        const channels = await fetchChannels(g.guild_id, integration.provider_user_id, userToken);
        return { guild: g, channels };
      })
    );

    for (const { guild, channels } of channelResults) {
      // Only consider text channels (type 0)
      const textChannels = channels.filter(c => c.type === 0);

      for (const channel of textChannels) {
        // If user specified a channel name, strict filter
        if (analysis.channelName) {
          if (!channel.name.toLowerCase().includes(analysis.channelName.toLowerCase())) {
            continue;
          }
        }

        const score = scoreChannel(channel, analysis.searchTerms);
        scoredChannels.push({
          channel,
          guildId: guild.guild_id,
          guildName: guild.guild_name,
          score,
        });
      }
    }

    // Sort by score descending, take top N channels
    scoredChannels.sort((a, b) => b.score - a.score);
    const topChannels = scoredChannels.slice(0, TOP_CHANNELS);

    if (topChannels.length === 0) {
      return null;
    }

    // 3. Fetch recent messages from top channels in parallel
    const timeframeStart = getTimeframeFilter(analysis.timeframe);
    const timeframeDate = timeframeStart ? new Date(timeframeStart) : null;

    const messageResults = await Promise.all(
      topChannels.map(async ({ channel, guildId, guildName }) => {
        const messages = await fetchMessages(channel.id, MESSAGES_PER_CHANNEL, userToken);
        return { channel, guildId, guildName, messages };
      })
    );

    // 4. Score and filter messages
    type ScoredMessage = {
      message: BotMessage;
      channelId: string;
      channelName: string;
      guildId: string;
      guildName: string;
      score: number;
    };
    const scoredMessages: ScoredMessage[] = [];

    for (const { channel, guildId, guildName, messages } of messageResults) {
      for (const msg of messages) {
        // Skip empty messages and bot messages
        if (!msg.content.trim() || msg.author.bot) continue;

        // Apply timeframe filter
        if (timeframeDate && new Date(msg.timestamp) < timeframeDate) continue;

        const score = scoreMessage(msg, analysis.searchTerms, analysis.authorName);
        if (score > 0 || analysis.searchTerms.length === 0) {
          scoredMessages.push({
            message: msg,
            channelId: channel.id,
            channelName: channel.name,
            guildId,
            guildName,
            score,
          });
        }
      }
    }

    // Sort by score, then by timestamp descending
    scoredMessages.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime();
    });

    // Take top results
    const topMessages = scoredMessages.slice(0, MAX_RESULTS);

    if (topMessages.length === 0) {
      return null;
    }

    // 5. Format as DiscordSearchResult for formatDiscordContext()
    const results: DiscordSearchResult[] = topMessages.map(m => ({
      id: m.message.id,
      source_id: m.message.id,
      title: null,
      content: `**${m.message.author.global_name || m.message.author.username}:** ${m.message.content}`,
      metadata: {
        guild_id: m.guildId,
        guild_name: m.guildName,
        channel_id: m.channelId,
        channel_name: m.channelName,
        channel_type: 0,
        authors: [m.message.author.global_name || m.message.author.username],
        timestamp_end: m.message.timestamp,
      },
      similarity: m.score,
    }));

    return formatDiscordContext(results);
  } catch (error) {
    console.error('[Discord Context] Error retrieving context:', error);
    return null;
  }
}

// Export for backward compatibility
export { retrieveDiscordContext as retrieveRelevantContext };