/**
 * Streaming Chat API (Real Streaming)
 *
 * Provides real SSE streaming from LLM providers for instant time-to-first-token.
 * Performs auth, context enrichment, and cache checks inline (same as unified-chat).
 * On cache hit: streams cached content rapidly.
 * On cache miss: pipes real streaming chunks from provider adapters.
 * After stream completes: caches the full response and saves history asynchronously.
 */

import { NextRequest } from 'next/server';
import {
  resolveAuthentication,
  isAuthError,
  getUserId,
  logAuthMethodUsage,
  UnifiedSession,
} from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { sanitizeResponse } from '@/lib/response-sanitizer';
import { enrichContext, getGrokipediaContext } from '@/lib/context-enrichment';
import { performContextualSearch } from '@/lib/web-search';
import { extractTimezoneFromRequest, getCurrentDateInTimezone } from '@/lib/timezone-middleware';
import { analyzeFreshness, isCacheStale, getFreshnessContextHints, trackQueryStats } from '@/lib/queryFreshness';
import { cacheLifecycleManager, CacheLifecycle } from '@/lib/cache-lifecycle';
import { getNewsService } from '@/lib/news-service';
import { getWeatherService } from '@/lib/weather-service';
import { resolveProvider, ProviderResolutionError } from '@/services/llm/providerResolver';
import { createAdapter } from '@/services/llm/adapters';
import { generateRequestId } from '@/config/llmConfig';

const CACHE_VERSION = 'v7-integration-crud';

// Lazy load ranking modules
const getTierCache = async () => {
  const { tierCache } = await import('@/lib/tier-based-cache');
  return tierCache;
};

/**
 * Search for cached responses using tier-based system
 */
async function findCachedResponse(
  query: string,
  model: string,
  provider: string,
  threshold: number = 0.85
): Promise<any> {
  try {
    const tierCacheInstance = await getTierCache();
    const cached = await tierCacheInstance.findSimilarResponse(query, model, provider, {
      similarityThreshold: threshold,
      maxResults: 50,
      tierPriority: ['hot', 'warm', 'cool', 'cold', 'frozen'],
      includeArchived: false
    });

    if (cached) {
      return {
        response: cached.response,
        similarity: cached.similarity,
        cached: true,
        tier: cached.tier,
        metadata: cached.metadata
      };
    }
    return null;
  } catch (error) {
    console.error('[STREAM-CACHE] Error:', error);
    return null;
  }
}

/**
 * Store response in cache (fire and forget after streaming)
 */
async function storeInCacheAsync(
  query: string,
  response: string,
  model: string,
  provider: string,
  userId: string | null,
  responseTimeMs: number
): Promise<void> {
  try {
    const tierCacheInstance = await getTierCache();
    await tierCacheInstance.storeResponse(query, response, model, provider, userId, responseTimeMs);
  } catch (error) {
    console.error('[STREAM-CACHE-STORE] Error:', error);
  }
}

/**
 * Save chat history after streaming (fire and forget)
 */
async function saveChatHistoryAsync(
  userId: string,
  messages: any[],
  response: string,
  provider: string,
  model: string,
  responseTime: number,
  conversationId?: string,
  uploadedFiles?: any[]
): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const userMessage = messages[messages.length - 1];
    let conversation;

    if (conversationId) {
      const { data, error } = await supabase
        .from('conversations')
        .select()
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        conversationId = undefined;
      } else {
        conversation = data;
      }
    }

    if (!conversationId) {
      const { data, error: convError } = await supabase
        .from('conversations')
        .insert([{
          user_id: userId,
          title: userMessage.content.slice(0, 50) + '...',
          provider,
          model,
          platform: 'web'
        }])
        .select()
        .single();

      if (convError) return null;
      conversation = data;
      conversationId = data.id;

      if (uploadedFiles && uploadedFiles.length > 0) {
        const fileIds = uploadedFiles.map((f: any) => f.id);
        await supabase
          .from('conversation_files')
          .update({ conversation_id: conversationId })
          .in('id', fileIds)
          .eq('user_id', userId);
      }
    }

    await supabase.from('messages').insert([{
      conversation_id: conversation.id,
      user_id: userId,
      role: 'user',
      content: userMessage.content,
      provider,
      model,
      platform: 'web'
    }]);

    await supabase.from('messages').insert([{
      conversation_id: conversation.id,
      user_id: userId,
      role: 'assistant',
      content: response,
      provider,
      model,
      response_time_ms: responseTime,
      platform: 'web'
    }]);

    return conversation.id;
  } catch (error) {
    console.error('[STREAM-HISTORY] Error:', error);
    return null;
  }
}

/** Build CORS headers if the request comes from the Tauri desktop app */
function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const tauriOrigins = ['tauri://localhost', 'https://tauri.localhost', 'http://tauri.localhost', 'http://localhost'];
  if (tauriOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  return {};
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(request),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-timezone, x-timezone-offset',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const cors = getCorsHeaders(request);

  try {
    // Read body once upfront (NextRequest body can only be consumed once)
    const body = await request.json();
    const {
      messages,
      conversationId: clientConversationId,
      referencedConversations,
      systemPrompt,
      temperature,
      maxTokens,
      qualityMode = 'fast',
      uploadedFiles,
      contextHash: externalContextHash,
      contextData,
      contextType: externalContextType,
    } = body;

    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: 'No message provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
      );
    }

    // === Auth Resolution ===
    let userId: string | null = null;
    let session: UnifiedSession | null = null;
    let userApiKey: string | null = null;
    let userProvider: string | null = null;

    const authResult = await resolveAuthentication(request);
    if (!isAuthError(authResult)) {
      session = authResult as UnifiedSession;
      userId = getUserId(session);
      logAuthMethodUsage(session, '/api/v2/unified-chat-stream');

      if (userId) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_KEY!
        );

        // Check usage limits
        const { data: usageLimitCheck } = await supabase
          .rpc('check_usage_limit', { user_id_param: userId });

        if (usageLimitCheck === false) {
          return new Response(
            JSON.stringify({ error: 'Monthly request limit exceeded' }),
            { status: 429, headers: { 'Content-Type': 'application/json', ...cors } }
          );
        }

        // Check for user API keys
        const { data: credentials } = await supabase
          .from('user_provider_credentials')
          .select('provider, api_key')
          .eq('user_id', userId)
          .not('api_key', 'is', null);

        if (credentials && credentials.length > 0) {
          const providerMap: Record<string, string> = {
            'openai': 'chatgpt',
            'anthropic': 'claude',
            'google': 'gemini'
          };

          const requestedProvider = body.preferredProvider;
          const dbProviderName = providerMap[requestedProvider] || requestedProvider;
          const selectedCred = credentials.find(c => c.provider === dbProviderName) || credentials[0];

          if (selectedCred) {
            userApiKey = atob(selectedCred.api_key);
            const reverseMap: Record<string, string> = {
              'chatgpt': 'openai',
              'claude': 'anthropic',
              'gemini': 'google'
            };
            userProvider = reverseMap[selectedCred.provider] || selectedCred.provider;
          }
        }
      }
    }

    // === Context Enrichment ===
    const userTimezone = extractTimezoneFromRequest(request);
    const freshnessAnalysis = analyzeFreshness(userMessage);
    const contextAnalysis = enrichContext(userMessage, userTimezone);
    const freshnessHints = getFreshnessContextHints(userMessage, userTimezone.timezone);

    // Parallel context fetching
    const [grokipediaContext, searchContext, newsContext, weatherContext] = await Promise.all([
      contextAnalysis.shouldUseGrokipedia
        ? getGrokipediaContext(userMessage)
        : Promise.resolve(null),
      contextAnalysis.needsRealTime && contextAnalysis.realTimeCategory
        ? performContextualSearch(userMessage, contextAnalysis.realTimeCategory, contextAnalysis.confidence || 0.70)
        : Promise.resolve(null),
      getNewsService().getNewsContextIfNeeded(userMessage),
      getWeatherService().getWeatherContextIfNeeded(userMessage),
    ]);

    // Build enriched messages
    const enrichedMessages = [...messages];

    if (enrichedMessages.length === 0 || enrichedMessages[0].role !== 'system') {
      enrichedMessages.unshift({ role: 'system', content: contextAnalysis.systemContext });
    }

    if (freshnessHints) {
      enrichedMessages.splice(1, 0, { role: 'system', content: freshnessHints });
    }

    if (grokipediaContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: grokipediaContext });
    }
    if (searchContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: searchContext });
    }
    if (newsContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: newsContext });
    }
    if (weatherContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: weatherContext });
    }

    // Add conditional instruction based on whether real-time context was retrieved
    const hasRealTimeContext = !!(grokipediaContext || searchContext || newsContext || weatherContext);
    if (contextAnalysis.needsRealTime) {
      const contextInstruction = hasRealTimeContext
        ? 'Real-time context has been provided above. Use it confidently to answer the user\'s question. Cite sources where available. Do NOT say you lack real-time information.'
        : 'This query may need current information but no real-time context was retrieved. Provide your best answer from your knowledge and suggest the user check current sources for the latest details.';
      enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: contextInstruction });
    }

    // External context injection
    if (contextData && Object.keys(contextData).length > 0) {
      const { buildSystemPromptWithContext } = await import('@/lib/context-formatters');
      const contextPrompt = buildSystemPromptWithContext(null, contextData, externalContextType);
      if (contextPrompt) {
        enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: contextPrompt });
      }
    }

    // Integration context (GitHub repos, Discord messages, etc.)
    // Each retriever is wrapped independently so one failure doesn't block others
    let hasIntegrationWriteAction = false;
    if (userId) {
      // GitHub context
      try {
        const { retrieveRelevantContext: retrieveGitHubContext } = await import('@/lib/integrations/enhanced-context-retriever');
        const githubContext = await retrieveGitHubContext(userId, userMessage);
        if (githubContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: GitHub\n\nYou have direct access to the user's GitHub. You can view repositories, commits, code, issues, and pull requests. The data has already been retrieved server-side — use the result below to respond naturally.\n\n${githubContext}` });
        }
      } catch (e) {
        console.error('[Integration] GitHub context error:', e);
      }

      // Discord context
      try {
        const { retrieveDiscordContext, analyzeDiscordQuery } = await import('@/lib/integrations/discord-context-retriever');
        const discordAnalysis = analyzeDiscordQuery(userMessage);
        if (discordAnalysis.intent === 'send_message') {
          hasIntegrationWriteAction = true;
        }
        const discordContext = await retrieveDiscordContext(userId, userMessage);
        if (discordContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Discord\n\nYou have direct access to the user's Discord. You can view servers, channels, messages, and send messages to channels. The action has already been executed server-side — use the result below to respond naturally.\n\n${discordContext}` });
        }
      } catch (e) {
        console.error('[Integration] Discord context error:', e);
      }

      // Gmail context
      try {
        const { retrieveGmailContext, analyzeGmailQuery } = await import('@/lib/integrations/gmail-context-retriever');
        const gmailAnalysis = analyzeGmailQuery(userMessage);
        if (gmailAnalysis.intent === 'send_email' || gmailAnalysis.intent === 'reply_email') {
          hasIntegrationWriteAction = true;
        }
        const gmailContext = await retrieveGmailContext(userId, userMessage);
        if (gmailContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Gmail\n\nYou have direct access to the user's Gmail. You can search emails, read messages, view labels, and send emails on their behalf. The action has already been executed server-side — use the result below to respond naturally.\n\n${gmailContext}` });
        }
      } catch (e) {
        console.error('[Integration] Gmail context error:', e);
      }

      // Google Calendar context
      try {
        const { retrieveCalendarContext, analyzeCalendarQuery } = await import('@/lib/integrations/calendar-context-retriever');
        // Check if this is a calendar write action to bypass cache later
        const calendarAnalysis = analyzeCalendarQuery(userMessage);
        if (calendarAnalysis.intent === 'create_event' || calendarAnalysis.intent === 'delete_event' || calendarAnalysis.intent === 'update_event') {
          hasIntegrationWriteAction = true;
        }
        const calendarContext = await retrieveCalendarContext(userId, userMessage, userTimezone.timezone);
        if (calendarContext) {
          // Inject capability declaration so the AI knows it HAS calendar access
          // (prevents "I'm an AI, I can't access your calendar" responses)
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Google Calendar\n\nYou have direct access to the user's Google Calendar. You can create, read, update, and delete events on their behalf. The calendar action has already been executed server-side — use the result below to respond naturally.\n\n${calendarContext}` });
        } else if (hasIntegrationWriteAction) {
          // Intent detected but no calendar context — integration likely not connected
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: '## Calendar Action\n\nThe user wants to create or modify a calendar event, but their Google Calendar is not connected. Please let them know they need to connect Google Calendar in their Settings page first, then try again.' });
        }
      } catch (e) {
        console.error('[Integration] Calendar context error:', e);
      }

      // Slack context
      try {
        const { retrieveSlackContext, analyzeSlackQuery } = await import('@/lib/integrations/slack-context-retriever');
        const slackAnalysis = analyzeSlackQuery(userMessage);
        if (slackAnalysis.intent === 'send_message') {
          hasIntegrationWriteAction = true;
        }
        const slackContext = await retrieveSlackContext(userId, userMessage);
        if (slackContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Slack\n\nYou have direct access to the user's Slack. You can view channels, search messages, and send messages to channels. The action has already been executed server-side — use the result below to respond naturally.\n\n${slackContext}` });
        }
      } catch (e) {
        console.error('[Integration] Slack context error:', e);
      }

      // Teams context
      try {
        const { retrieveTeamsContext } = await import('@/lib/integrations/teams-context-retriever');
        const teamsContext = await retrieveTeamsContext(userId, userMessage);
        if (teamsContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Microsoft Teams\n\nYou have direct access to the user's Microsoft Teams. You can view teams, channels, and search messages. The data has already been retrieved server-side — use the result below to respond naturally.\n\n${teamsContext}` });
        }
      } catch (e) {
        console.error('[Integration] Teams context error:', e);
      }

      // Notion context
      try {
        const { retrieveNotionContext } = await import('@/lib/integrations/notion-context-retriever');
        const notionContext = await retrieveNotionContext(userId, userMessage);
        if (notionContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Notion\n\nYou have direct access to the user's Notion. You can search pages, databases, and read page content. The data has already been retrieved server-side — use the result below to respond naturally.\n\n${notionContext}` });
        }
      } catch (e) {
        console.error('[Integration] Notion context error:', e);
      }

      // Google Drive context
      try {
        const { retrieveDriveContext } = await import('@/lib/integrations/drive-context-retriever');
        const driveContext = await retrieveDriveContext(userId, userMessage);
        if (driveContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Google Drive\n\nYou have direct access to the user's Google Drive. You can search files, read document contents, and browse folders. The data has already been retrieved server-side — use the result below to respond naturally.\n\n${driveContext}` });
        }
      } catch (e) {
        console.error('[Integration] Drive context error:', e);
      }

      // Jira context
      try {
        const { retrieveJiraContext, analyzeJiraQuery } = await import('@/lib/integrations/jira-context-retriever');
        const jiraAnalysis = analyzeJiraQuery(userMessage);
        if (jiraAnalysis.intent === 'create_issue' || jiraAnalysis.intent === 'update_issue') {
          hasIntegrationWriteAction = true;
        }
        const jiraContext = await retrieveJiraContext(userId, userMessage);
        if (jiraContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Jira\n\nYou have direct access to the user's Jira. You can search issues, view sprints, and create or update issues. The action has already been executed server-side — use the result below to respond naturally.\n\n${jiraContext}` });
        }
      } catch (e) {
        console.error('[Integration] Jira context error:', e);
      }
    }

    // Uploaded files context
    if (uploadedFiles && uploadedFiles.length > 0 && userId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );
      const fileIds = uploadedFiles.map((f: any) => f.id);
      const { data: files } = await supabase
        .from('conversation_files')
        .select('file_name, file_type, content_text')
        .in('id', fileIds)
        .eq('user_id', userId);

      if (files && files.length > 0) {
        let fileContext = 'Attached Files:\n\n';
        files.forEach((file: any, index: number) => {
          fileContext += `File ${index + 1}: ${file.file_name} (${file.file_type})\n`;
          if (file.file_type.startsWith('image/')) {
            fileContext += `${file.content_text}\n\n`;
          } else {
            fileContext += `\`\`\`\n${file.content_text}\n\`\`\`\n\n`;
          }
        });
        fileContext += '---\nPlease analyze the attached files and respond to the user\'s query considering the file content.';
        enrichedMessages.splice(enrichedMessages.length - 1, 0, { role: 'system', content: fileContext });
      }
    }

    // Enriched query on last message
    enrichedMessages[enrichedMessages.length - 1] = {
      ...enrichedMessages[enrichedMessages.length - 1],
      content: contextAnalysis.enrichedQuery,
    };

    // Referenced conversations
    if (referencedConversations && referencedConversations.length > 0 && userId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );
      for (const refConvId of referencedConversations) {
        try {
          const { data: refMessages } = await supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', refConvId)
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(10);

          if (refMessages && refMessages.length > 0) {
            const { data: refConv } = await supabase
              .from('conversations')
              .select('title')
              .eq('id', refConvId)
              .eq('user_id', userId)
              .single();

            enrichedMessages.splice(enrichedMessages.length - 1, 0, {
              role: 'system',
              content: `Referenced conversation "${refConv?.title || 'Previous Chat'}":\n\n${refMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}`
            });
          }
        } catch {
          // Continue with other references
        }
      }
    }

    // === Provider Resolution ===
    let providerResolution;
    try {
      providerResolution = await resolveProvider({
        headers: request.headers,
        requestId,
        endpoint: '/api/v2/unified-chat-stream',
        userApiKey,
        userProvider,
      });
    } catch (error) {
      if (error instanceof ProviderResolutionError) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: error.statusCode, headers: { 'Content-Type': 'application/json', ...cors } }
        );
      }
      throw error;
    }

    const cacheModel = providerResolution.provider === 'internal' || providerResolution.provider === 'free'
      ? 'free-model'
      : `${providerResolution.provider}-model`;
    const cacheProvider = providerResolution.provider;

    // Cache key construction
    const timezoneDateKey = getCurrentDateInTimezone(userTimezone.timezone);
    const freshnessKey = freshnessAnalysis.isTimeSensitive ? `fresh:${timezoneDateKey}` : 'static';
    const versionedCacheModel = `${cacheModel}:${CACHE_VERSION}:${freshnessKey}:${userTimezone.timezone}`;

    // Context hash for cache invalidation
    const contextHash = cacheLifecycleManager.generateContextHash({
      enrichedQuery: contextAnalysis.enrichedQuery,
      systemContext: contextAnalysis.systemContext,
      searchContext,
      newsContext,
      weatherContext,
      version: CACHE_VERSION,
      timezone: userTimezone.timezone,
      date: timezoneDateKey
    });

    // === Cache Check ===
    // Bypass cache for calendar write actions (create/delete) since they perform side effects
    let cached: any = null;
    if (!freshnessAnalysis.bypassCache && !hasIntegrationWriteAction) {
      cached = await findCachedResponse(userMessage, versionedCacheModel, cacheProvider);
    }

    if (cached) {
      const cachedAt = cached.metadata?.cached_at ? new Date(cached.metadata.cached_at) : new Date(0);
      const isStale = isCacheStale(cachedAt, userMessage, userTimezone.timezone);

      if (isStale) {
        cached = null;
        trackQueryStats(freshnessAnalysis.isTimeSensitive, false);
      } else {
        const lifecycle = cached.metadata?.lifecycle || 'hot';
        const storedContextHash = cached.metadata?.context_hash;

        if (lifecycle === CacheLifecycle.STALE || lifecycle === CacheLifecycle.COLD) {
          cached = null;
        } else if (storedContextHash && storedContextHash !== contextHash) {
          cached = null;
        }
      }
    }

    // === Create SSE Stream ===
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const startTime = Date.now();

    if (cached) {
      // --- CACHE HIT: Stream cached content rapidly ---
      trackQueryStats(freshnessAnalysis.isTimeSensitive, true);
      const sanitizedContent = sanitizeResponse(cached.response);
      const cachedProviderUsed = cached.metadata?.provider || cacheProvider;

      (async () => {
        try {
          // Stream cached content in larger chunks for speed
          const chunkSize = 80; // characters per chunk
          for (let i = 0; i < sanitizedContent.length; i += chunkSize) {
            const chunk = sanitizedContent.slice(i, i + chunkSize);
            await writer.write(encoder.encode(`data: ${JSON.stringify({
              content: chunk,
              done: false,
              provider: cachedProviderUsed,
              model: versionedCacheModel,
              cached: true,
            })}\n\n`));
          }

          // Save history to get conversationId
          let savedConversationId: string | null = clientConversationId || null;
          if (userId && session?.authMethod !== 'api_key') {
            const responseTime = Date.now() - startTime;
            const historyConvId = await saveChatHistoryAsync(
              userId,
              messages,
              sanitizedContent,
              cachedProviderUsed,
              versionedCacheModel,
              responseTime,
              clientConversationId,
              uploadedFiles
            );
            if (historyConvId) {
              savedConversationId = historyConvId;
            }
          }

          // Final message with metadata and full content
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            content: sanitizedContent,
            done: true,
            provider: cachedProviderUsed,
            model: versionedCacheModel,
            cached: true,
            cacheId: cached.metadata?.id,
            similarity: cached.similarity,
            conversationId: savedConversationId,
          })}\n\n`));

          await writer.close();
        } catch {
          try { await writer.close(); } catch { /* already closed */ }
        }
      })();

      // Increment usage counter asynchronously
      if (userId) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_KEY!
        );
        supabase.rpc('increment_usage_count', { user_id_param: userId })
          .then(() => {}, () => {});
      }
    } else {
      // --- CACHE MISS: Real streaming from provider ---
      trackQueryStats(freshnessAnalysis.isTimeSensitive, false);

      const adapter = createAdapter(providerResolution.provider, userApiKey || undefined);

      const chatParams = {
        messages: enrichedMessages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
        maxTokens,
        systemPrompt,
        temperature,
        qualityMode,
      };

      (async () => {
        let fullContent = '';
        let streamProvider: string = providerResolution.provider;
        let streamModel: string = cacheModel;

        try {
          if (adapter.chatStream) {
            // Real streaming path
            for await (const chunk of adapter.chatStream(chatParams)) {
              if (chunk.content) {
                fullContent += chunk.content;
                await writer.write(encoder.encode(`data: ${JSON.stringify({
                  content: chunk.content,
                  done: false,
                  provider: chunk.provider || streamProvider,
                  model: chunk.model || streamModel,
                  cached: false,
                })}\n\n`));
              }

              if (chunk.provider) streamProvider = chunk.provider;
              if (chunk.model) streamModel = chunk.model;

              if (chunk.done) {
                break;
              }
            }
          } else {
            // Fallback: adapter doesn't support streaming, use non-streaming + chunk
            const response = await adapter.chat(chatParams);
            fullContent = response.content;
            streamProvider = response.provider;
            streamModel = response.model || cacheModel;

            const chunkSize = 60;
            for (let i = 0; i < fullContent.length; i += chunkSize) {
              const chunk = fullContent.slice(i, i + chunkSize);
              await writer.write(encoder.encode(`data: ${JSON.stringify({
                content: chunk,
                done: false,
                provider: streamProvider,
                model: streamModel,
                cached: false,
              })}\n\n`));
            }
          }

          // === Post-stream: Cache and save history before sending done event ===
          const responseTime = Date.now() - startTime;
          let savedConversationId: string | null = clientConversationId || null;

          if (fullContent) {
            const sanitizedContent = sanitizeResponse(fullContent);

            // Cache the response (fire and forget)
            storeInCacheAsync(
              userMessage,
              sanitizedContent,
              versionedCacheModel,
              cacheProvider,
              userId,
              responseTime
            ).catch(() => {});

            // Save chat history (await to get conversationId for client navigation)
            const userAgent = request.headers.get('user-agent') || '';
            const isCliRequest = userAgent.includes('cachegpt-cli');
            const shouldSaveHistory = session?.authMethod !== 'api_key' && !isCliRequest;

            if (shouldSaveHistory && userId) {
              const historyConvId = await saveChatHistoryAsync(
                userId,
                messages,
                sanitizedContent,
                streamProvider,
                streamModel,
                responseTime,
                clientConversationId,
                uploadedFiles
              );
              if (historyConvId) {
                savedConversationId = historyConvId;
              }
            }

            // Log usage (fire and forget)
            if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
              const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
              );
              supabase.from('usage').insert({
                user_id: userId,
                endpoint: '/api/v2/unified-chat-stream',
                method: 'POST',
                model: cacheModel,
                metadata: {
                  provider: streamProvider,
                  cached: false,
                  response_time: responseTime,
                  response_length: sanitizedContent.length,
                  streaming: true,
                }
              }).then(() => {}, () => {});
            }

            // Increment usage counter
            if (userId) {
              const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_KEY!
              );
              supabase.rpc('increment_usage_count', { user_id_param: userId })
                .then(() => {}, () => {});
            }
          }

          // Send done event with full content and conversationId
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            content: fullContent,
            done: true,
            provider: streamProvider,
            model: streamModel,
            cached: false,
            conversationId: savedConversationId,
            ...(hasIntegrationWriteAction && { calendarEventCreated: true }),
          })}\n\n`));

          await writer.close();
        } catch (error: any) {
          console.error('[STREAM] Provider streaming error:', error.message);

          // Send error event to client
          try {
            await writer.write(encoder.encode(`data: ${JSON.stringify({
              error: error.message || 'Streaming failed',
              done: true,
            })}\n\n`));
            await writer.close();
          } catch {
            try { await writer.close(); } catch { /* already closed */ }
          }
        }
      })();
    }

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId,
        ...cors,
      },
    });

  } catch (error: any) {
    console.error('[STREAM] Request error:', error);
    return new Response(
      JSON.stringify({ error: 'Streaming request failed' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors }
      }
    );
  }
}
