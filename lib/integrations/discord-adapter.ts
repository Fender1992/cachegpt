/**
 * Discord Integration Adapter
 * Fetches messages from Discord servers, processes them, generates embeddings,
 * and stores them in integration_documents for context retrieval
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from '@/lib/embeddings';
import crypto from 'crypto';

const DISCORD_API = 'https://discord.com/api/v10';

// Discord limits and configuration
const MAX_GUILDS = 10; // Max number of servers to sync
const MAX_CHANNELS_PER_GUILD = 20; // Max channels per server
const MAX_MESSAGES_PER_CHANNEL = 100; // Max recent messages per channel
const CHUNK_SIZE = 2000; // Characters per chunk
const CHUNK_OVERLAP = 200;
const EMBEDDING_BATCH_SIZE = 20;
const MESSAGE_FETCH_DELAY_MS = 100; // Delay between API calls to respect rate limits

// Channel types we want to index
const INDEXABLE_CHANNEL_TYPES = new Set([
  0,  // GUILD_TEXT
  5,  // GUILD_NEWS
  10, // GUILD_NEWS_THREAD
  11, // GUILD_PUBLIC_THREAD
  12, // GUILD_PRIVATE_THREAD
]);

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner_id: string;
  permissions?: string;
  member_count?: number;
  premium_tier?: number;
  description?: string | null;
  features?: string[];
}

interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string | null;
  parent_id?: string | null;
  last_message_id?: string | null;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    global_name?: string | null;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  attachments?: Array<{
    id: string;
    filename: string;
    description?: string;
    content_type?: string;
    url: string;
  }>;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    author?: { name?: string };
    fields?: Array<{ name: string; value: string }>;
  }>;
  thread?: {
    id: string;
    name: string;
  };
  referenced_message?: {
    id: string;
    content: string;
    author: { username: string };
  };
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

async function discordFetch(url: string, token: string): Promise<Response> {
  // Use Bot token if available, fall back to Bearer token
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const authHeader = botToken ? `Bot ${botToken}` : `Bearer ${token}`;

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get('X-RateLimit-Reset-After');
    if (retryAfter) {
      const waitMs = parseFloat(retryAfter) * 1000;
      if (waitMs <= 60000) { // Max 60 seconds wait
        await delay(waitMs);
        return discordFetch(url, token);
      }
    }
    throw new Error('Discord API rate limited');
  }

  return response;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Format message content for indexing
 */
function formatMessageContent(message: DiscordMessage, channelName?: string, guildName?: string): string {
  const parts: string[] = [];
  
  // Add context header
  if (guildName && channelName) {
    parts.push(`[${guildName} > #${channelName}]`);
  }
  
  // Add timestamp
  const date = new Date(message.timestamp);
  parts.push(`[${date.toLocaleDateString()} ${date.toLocaleTimeString()}]`);
  
  // Add author
  const authorName = message.author.global_name || message.author.username;
  parts.push(`${authorName}: ${message.content}`);
  
  // Add attachments info
  if (message.attachments && message.attachments.length > 0) {
    const attachmentInfo = message.attachments
      .map(a => `[Attachment: ${a.filename}${a.description ? ` - ${a.description}` : ''}]`)
      .join(', ');
    parts.push(attachmentInfo);
  }
  
  // Add embed information
  if (message.embeds && message.embeds.length > 0) {
    message.embeds.forEach(embed => {
      if (embed.title) parts.push(`[Embed: ${embed.title}]`);
      if (embed.description) parts.push(embed.description);
      if (embed.fields) {
        embed.fields.forEach(field => {
          parts.push(`${field.name}: ${field.value}`);
        });
      }
    });
  }
  
  // Add referenced message if it's a reply
  if (message.referenced_message) {
    parts.push(`[Reply to ${message.referenced_message.author.username}: "${message.referenced_message.content.slice(0, 100)}..."]`);
  }
  
  return parts.join('\n');
}

/**
 * Chunk messages for better context retrieval
 */
function chunkMessages(messages: string[], metadata: any): Array<{ text: string; index: number; metadata: any }> {
  const fullText = messages.join('\n\n---\n\n');
  
  if (fullText.length <= CHUNK_SIZE) {
    return [{ text: fullText, index: 0, metadata }];
  }
  
  const chunks: Array<{ text: string; index: number; metadata: any }> = [];
  let start = 0;
  let index = 0;
  
  while (start < fullText.length) {
    const end = Math.min(start + CHUNK_SIZE, fullText.length);
    let chunkEnd = end;
    
    // Try to break at a message boundary
    if (end < fullText.length) {
      const lastBreak = fullText.lastIndexOf('---', end);
      if (lastBreak > start + CHUNK_SIZE / 2) {
        chunkEnd = lastBreak;
      }
    }
    
    const chunkText = fullText.slice(start, chunkEnd);
    chunks.push({ 
      text: chunkText, 
      index,
      metadata: {
        ...metadata,
        chunk_index: index,
        total_chunks: Math.ceil(fullText.length / (CHUNK_SIZE - CHUNK_OVERLAP))
      }
    });
    
    start = chunkEnd - CHUNK_OVERLAP;
    if (start >= fullText.length) break;
    index++;
  }
  
  return chunks;
}

/**
 * Sync Discord messages for a user
 */
export async function syncDiscordMessages(
  userId: string,
  integrationId: string,
  accessToken: string
): Promise<{ 
  guildsProcessed: number; 
  channelsProcessed: number; 
  messagesIndexed: number; 
  errors: string[] 
}> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let guildsProcessed = 0;
  let channelsProcessed = 0;
  let messagesIndexed = 0;

  // Update status to syncing
  await supabase
    .from('user_integrations')
    .update({ 
      status: 'syncing', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', integrationId);

  try {
    // Fetch user's guilds (servers)
    const guildsResponse = await discordFetch(`${DISCORD_API}/users/@me/guilds`, accessToken);
    if (!guildsResponse.ok) {
      throw new Error('Failed to fetch Discord guilds');
    }
    
    const guilds: DiscordGuild[] = await guildsResponse.json();
    
    // Filter guilds where user has read permissions
    const readableGuilds = guilds
      .filter(g => {
        // Check if user has VIEW_CHANNEL permission (0x400)
        // Note: permissions is returned as a string from Discord API
        const perms = BigInt(g.permissions || '0');
        return (perms & BigInt(0x400)) === BigInt(0x400);
      })
      .slice(0, MAX_GUILDS);

    // Get existing content hashes to skip unchanged messages
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

    // Track all source IDs we've seen this sync
    const allCurrentSourceIds = new Set<string>();

    for (const guild of readableGuilds) {
      try {
        guildsProcessed++;
        
        // Get channels for this guild
        const channelsResponse = await discordFetch(
          `${DISCORD_API}/guilds/${guild.id}/channels`,
          accessToken
        );
        
        if (!channelsResponse.ok) {
          errors.push(`Failed to fetch channels for guild ${guild.name}`);
          continue;
        }
        
        const channels: DiscordChannel[] = await channelsResponse.json();
        
        // Filter to text channels we can read
        const textChannels = channels
          .filter(c => INDEXABLE_CHANNEL_TYPES.has(c.type))
          .slice(0, MAX_CHANNELS_PER_GUILD);
        
        // Store/update channel metadata
        const channelMetadata = textChannels.map(channel => ({
          integration_id: integrationId,
          guild_id: guild.id,
          channel_id: channel.id,
          channel_name: channel.name || 'unnamed',
          channel_type: channel.type,
          parent_id: channel.parent_id,
          topic: channel.topic,
          last_message_id: channel.last_message_id,
        }));
        
        if (channelMetadata.length > 0) {
          await supabase
            .from('discord_channel_metadata')
            .upsert(channelMetadata, { onConflict: 'integration_id,channel_id' });
        }
        
        // Process each channel
        for (const channel of textChannels) {
          try {
            channelsProcessed++;
            await delay(MESSAGE_FETCH_DELAY_MS);
            
            // Fetch recent messages
            const messagesUrl = `${DISCORD_API}/channels/${channel.id}/messages?limit=${MAX_MESSAGES_PER_CHANNEL}`;
            const messagesResponse = await discordFetch(messagesUrl, accessToken);
            
            if (!messagesResponse.ok) {
              if (messagesResponse.status === 403) {
                // No access to this channel, skip silently
                continue;
              }
              errors.push(`Failed to fetch messages for channel ${channel.name}`);
              continue;
            }
            
            const messages: DiscordMessage[] = await messagesResponse.json();
            
            if (messages.length === 0) continue;
            
            // Group messages by conversation thread (every 10 messages or 1 hour gap)
            const messageGroups: DiscordMessage[][] = [];
            let currentGroup: DiscordMessage[] = [];
            let lastTimestamp = new Date(messages[0].timestamp);
            
            for (const message of messages) {
              const messageTime = new Date(message.timestamp);
              const hoursDiff = (lastTimestamp.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
              
              if (currentGroup.length >= 10 || hoursDiff > 1) {
                if (currentGroup.length > 0) {
                  messageGroups.push(currentGroup);
                }
                currentGroup = [message];
                lastTimestamp = messageTime;
              } else {
                currentGroup.push(message);
                lastTimestamp = messageTime;
              }
            }
            
            if (currentGroup.length > 0) {
              messageGroups.push(currentGroup);
            }
            
            // Process each message group
            const pendingChunks: Array<{
              sourceId: string;
              sourceUrl: string;
              title: string;
              text: string;
              chunkIndex: number;
              contentHash: string;
              metadata: Record<string, any>;
            }> = [];
            
            for (const group of messageGroups) {
              const sourceId = `discord:${guild.id}:${channel.id}:${group[0].id}`;
              allCurrentSourceIds.add(sourceId);
              
              const formattedMessages = group.map(msg => 
                formatMessageContent(msg, channel.name, guild.name)
              );
              
              const combinedContent = formattedMessages.join('\n\n');
              const contentHash = sha256(combinedContent);
              
              // Skip if unchanged
              if (existingHashes.get(sourceId) === contentHash) continue;
              
              const metadata = {
                guild_id: guild.id,
                guild_name: guild.name,
                channel_id: channel.id,
                channel_name: channel.name,
                channel_type: channel.type,
                message_count: group.length,
                first_message_id: group[0].id,
                last_message_id: group[group.length - 1].id,
                timestamp_start: group[group.length - 1].timestamp,
                timestamp_end: group[0].timestamp,
                authors: [...new Set(group.map(m => m.author.username))],
              };
              
              const chunks = chunkMessages(formattedMessages, metadata);
              
              for (const chunk of chunks) {
                pendingChunks.push({
                  sourceId: `${sourceId}:${chunk.index}`,
                  sourceUrl: `https://discord.com/channels/${guild.id}/${channel.id}/${group[0].id}`,
                  title: `${guild.name} > #${channel.name}`,
                  text: chunk.text,
                  chunkIndex: chunk.index,
                  contentHash,
                  metadata: chunk.metadata,
                });
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
                      provider: 'discord',
                      source_type: 'message',
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
                  messagesIndexed++;
                }
              }
            }
          } catch (channelError: any) {
            errors.push(`Error syncing channel ${channel.name}: ${channelError.message}`);
          }
        }
      } catch (guildError: any) {
        errors.push(`Error syncing guild ${guild.name}: ${guildError.message}`);
      }
    }

    // Clean up stale documents (messages that were deleted or are no longer accessible)
    const { data: allDocs } = await supabase
      .from('integration_documents')
      .select('id, source_id')
      .eq('integration_id', integrationId);

    if (allDocs) {
      const staleIds = allDocs
        .filter(d => !allCurrentSourceIds.has(d.source_id.split(':').slice(0, 4).join(':')))
        .map(d => d.id);

      if (staleIds.length > 0) {
        // Delete in batches
        for (let i = 0; i < staleIds.length; i += 100) {
          await supabase
            .from('integration_documents')
            .delete()
            .in('id', staleIds.slice(i, i + 100));
        }
      }
    }

    // Update integration status
    await supabase
      .from('user_integrations')
      .update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider_data: {
          guilds_synced: guildsProcessed,
          channels_synced: channelsProcessed,
          messages_indexed: messagesIndexed,
          last_sync_errors: errors.slice(0, 5), // Keep last 5 errors
        },
      })
      .eq('id', integrationId);

    return { guildsProcessed, channelsProcessed, messagesIndexed, errors };
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