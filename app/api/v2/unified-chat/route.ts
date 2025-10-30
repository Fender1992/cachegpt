/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to chat API logic, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * This endpoint is the CORE of the chat system - changes here
 * affect both web and CLI users. After making changes:
 * - Update STATUS file with chat system changes
 * - Document any new provider integrations
 * - Note any cache/performance implications
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAuthentication,
  isAuthError,
  getUserId,
  logAuthMethodUsage,
  UnifiedSession,
  createSessionErrorMessage
} from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import {
  getQualityScore,
  analyzeResponse
} from '@/lib/response-validator';
import { sanitizeResponse, hasExecutionArtifacts } from '@/lib/response-sanitizer';
import { enrichContext, generateSystemContext, getGrokipediaContext } from '@/lib/context-enrichment';
import { performContextualSearch } from '@/lib/web-search';
import { detectUserTimezone } from '@/lib/timezone-detector';
import { extractTimezoneFromRequest, trackTimezoneUsage, getCurrentDateInTimezone } from '@/lib/timezone-middleware';
import { analyzeFreshness, generateCacheKey, isCacheStale, getFreshnessContextHints, trackQueryStats } from '@/lib/queryFreshness';
import { cacheLifecycleManager, QueryType, CacheLifecycle } from '@/lib/cache-lifecycle';
import { getNewsService } from '@/lib/news-service';
import { getWeatherService } from '@/lib/weather-service';
import { resolveProvider, ProviderResolutionError, createProviderErrorResponse } from '@/services/llm/providerResolver';
import { createAdapter } from '@/services/llm/adapters';
import { generateRequestId } from '@/config/llmConfig';

/**
 * Cache Version Management
 *
 * Bump this version when:
 * - Context enrichment system changes (date format, new data sources)
 * - System prompts are updated
 * - Response format changes
 * - Model behavior expectations change
 *
 * This creates separate cache namespaces, preventing stale responses with:
 * - Incorrect dates
 * - Missing context enrichment
 * - Outdated system instructions
 *
 * Version History:
 * - v1 (implicit): Pre-context enrichment (before v11.4.0)
 * - v2-enriched: Context enrichment with date/time + web search (v11.4.0+)
 */
const CACHE_VERSION = 'v2-enriched';

// Lazy load ranking modules to avoid build-time initialization
const getTierCache = async () => {
  const { tierCache } = await import('@/lib/tier-based-cache');
  return tierCache;
};

const getPredictiveCache = async () => {
  const { predictiveCache } = await import('@/lib/predictive-cache');
  return predictiveCache;
};

const getRankingManager = async () => {
  const { rankingManager } = await import('@/lib/ranking-features-manager');
  return rankingManager;
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

    // Use the new tier-based cache system
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
    console.error('[CACHE-SEARCH] Error:', error);
    // Fallback to original implementation
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      // Generate OpenAI embedding for the query
      const { generateEmbedding } = await import('@/lib/embeddings');
      const queryEmbedding = await generateEmbedding(query);

      // Use pgvector similarity search via database function
      const { data: matches, error: dbError } = await supabase
        .rpc('find_similar_cached_response', {
          query_embedding: JSON.stringify(queryEmbedding),
          similarity_threshold: threshold,
          result_limit: 1,
          provider_filter: provider,
          model_filter: model
        });

      if (dbError) {
        console.error('[CACHE-SEARCH-FALLBACK] Database error:', dbError);
        return null;
      }

      if (!matches || matches.length === 0) {
        return null;
      }

      const bestMatch = matches[0];

      // Update access count
      await supabase
        .from('cached_responses')
        .update({
          access_count: bestMatch.access_count + 1,
          last_accessed: new Date().toISOString()
        })
        .eq('id', bestMatch.id);

      return {
        response: bestMatch.response,
        similarity: bestMatch.similarity,
        cached: true
      };

    } catch (fallbackError) {
      console.error('[CACHE-SEARCH-FALLBACK] Error:', fallbackError);
      return null;
    }
  }
}

/**
 * Save chat history to unified conversation system
 */
async function saveChatHistory(
  userId: string | null,
  messages: any[],
  response: string,
  provider: string,
  model: string,
  responseTime: number,
  platform: string = 'web',
  conversationId?: string
): Promise<string | null> {
  if (!userId) {
    return null;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const userMessage = messages[messages.length - 1];
    let conversation;

    // If conversationId provided, use existing conversation
    if (conversationId) {
      const { data, error } = await supabase
        .from('conversations')
        .select()
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.error('[CHAT-HISTORY] Conversation not found, creating new one');
        conversationId = undefined;
      } else {
        conversation = data;
      }
    }

    // Create new conversation if needed
    if (!conversationId) {
      const { data, error: convError } = await supabase
        .from('conversations')
        .insert([{
          user_id: userId,
          title: userMessage.content.slice(0, 50) + '...',
          provider,
          model,
          platform
        }])
        .select()
        .single();

      if (convError) {
        console.error('[CHAT-HISTORY] Error creating conversation:', convError);
        return null;
      }
      conversation = data;
    }

    // Save user message
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        user_id: userId,
        role: 'user',
        content: userMessage.content,
        provider,
        model,
        platform
      }]);

    if (userMsgError) {
      console.error('[CHAT-HISTORY] Error saving user message:', userMsgError);
    }

    // Save assistant response
    const { error: assistantMsgError } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        user_id: userId,
        role: 'assistant',
        content: response,
        provider,
        model,
        response_time_ms: responseTime,
        platform
      }]);

    if (assistantMsgError) {
      console.error('[CHAT-HISTORY] Error saving assistant message:', assistantMsgError);
      return null;
    }

    return conversation.id;

  } catch (error) {
    console.error('[CHAT-HISTORY] Error saving chat history:', error);
    return null;
  }
}

/**
 * Store response in cache database using tier-based system
 * Now includes freshness metadata and timezone info
 */
async function storeInCache(
  query: string,
  response: string,
  model: string,
  provider: string,
  userId: string | null,
  responseTimeMs: number,
  contextHash?: string,
  freshnessAnalysis?: any,
  timezone?: string
): Promise<void> {
  try {
    const tierCacheInstance = await getTierCache();

    // Use the new tier-based cache system
    const responseId = await tierCacheInstance.storeResponse(
      query,
      response,
      model,
      provider,
      userId,
      responseTimeMs
    );

    if (!responseId) {
      console.error('[TIER-CACHE] Failed to store response - storeResponse returned null/undefined');
    } else {
      console.log('[TIER-CACHE] Successfully stored response with ID:', responseId);
    }

  } catch (error) {
    console.error('[CACHE-STORE] Error:', error);
    // Fallback to original implementation
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      // Generate OpenAI embedding for semantic search
      const { generateEmbedding } = await import('@/lib/embeddings');
      const embedding = await generateEmbedding(query);

      // Classify query type for lifecycle management
      const queryType = cacheLifecycleManager.classifyQueryType(query);

      const insertData = {
        query,
        response,
        model,
        provider,
        embedding: JSON.stringify(embedding), // Store as JSON for pgvector
        user_id: userId,
        access_count: 1,
        popularity_score: 50.0,
        ranking_version: 1,
        tier: 'cool',
        cost_saved: 0.01,
        is_archived: false,
        ranking_metadata: {
          initial_response_time: responseTimeMs,
          created_by_user: userId,
          // Freshness metadata
          is_time_sensitive: freshnessAnalysis?.isTimeSensitive || false,
          freshness_category: freshnessAnalysis?.category || 'static',
          freshness_ttl: freshnessAnalysis?.ttl || 86400,
          cached_at: new Date().toISOString(),
          timezone: timezone || 'UTC'
        },
        // Lifecycle metadata
        lifecycle: 'hot',
        query_type: queryType,
        context_hash: contextHash || null,
        quality_score: 0.0,
        created_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_score_update: new Date().toISOString(),
        lifecycle_updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('cached_responses')
        .insert(insertData)
        .select('id');

      if (error) {
        console.error('[CACHE-STORE-FALLBACK] Database error:', error);
      }

    } catch (fallbackError) {
      console.error('[CACHE-STORE-FALLBACK] Error:', fallbackError);
    }
  }
}

/**
 * Call premium provider with user's API key
 */
async function callPremiumProvider(
  messages: any[],
  provider: string,
  apiKey: string,
  model: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }
): Promise<{ response: string; provider: string }> {
  try {
    // Extract mode options with defaults
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 2000;
    const systemPrompt = options?.systemPrompt;

    // Prepend system prompt to messages if provided
    const messagesWithSystem = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    let endpoint: string;
    let headers: any = {
      'Content-Type': 'application/json'
    };
    let body: any;

    switch (provider) {
      case 'openai':
      case 'chatgpt':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: model,
          messages: messagesWithSystem,
          temperature,
          max_tokens: maxTokens
        };
        break;

      case 'anthropic':
      case 'claude':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        // Claude uses system parameter, not system message
        const anthropicMessages = messagesWithSystem.filter(m => m.role !== 'system');
        body = {
          model: model,
          messages: anthropicMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          })),
          max_tokens: maxTokens,
          temperature
        };
        // Add system prompt as separate parameter for Claude
        if (systemPrompt) {
          body.system = systemPrompt;
        }
        break;

      case 'google':
      case 'gemini':
        // Extract model name from full model ID (e.g., "gemini-2.0-flash-exp" -> "gemini-2.0-flash-exp")
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        body = {
          contents: messagesWithSystem.map(m => ({
            role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : 'user',
            parts: [{ text: m.role === 'system' ? `[System Instructions]: ${m.content}` : m.content }]
          })),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        };
        break;

      case 'perplexity':
        endpoint = 'https://api.perplexity.ai/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: model,
          messages: messagesWithSystem,
          temperature
        };
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }

    const data = await response.json();
    let responseText: string;

    switch (provider) {
      case 'claude':
        responseText = data.content?.[0]?.text || 'No response';
        break;
      case 'gemini':
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
        break;
      default:
        responseText = data.choices?.[0]?.message?.content || 'No response';
    }

    return { response: responseText, provider };

  } catch (error: any) {
    console.error(`[PREMIUM-PROVIDER] ${provider} error:`, error.message);
    throw error;
  }
}

/**
 * Call free provider APIs with server-managed keys
 */
async function callFreeProvider(messages: any[]): Promise<{ response: string; provider: string }> {
  const providers = [
    {
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile'  // Llama 3.3 70B - Latest from Meta (Sep 2025), 6x faster with speculative decoding
    },
    {
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'meta-llama/llama-4-maverick:free'  // Llama 4 Maverick 17B (128 experts, 400B total) - Released April 2025, MoE architecture, 1M token context
    },
    {
      name: 'grok-openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'x-ai/grok-2-1212'  // Grok 2 - xAI's latest (Dec 2024), excellent for factual queries and reasoning
    }
  ];

  // Add multiple HuggingFace models for diversity and load balancing
  if (process.env.HUGGINGFACE_API_KEY) {
    const hfModels = [
      { name: 'huggingface-1', model: 'meta-llama/Llama-3.3-70B-Instruct', desc: 'High quality - 70B parameters' },
      { name: 'huggingface-2', model: 'meta-llama/Llama-3.1-8B-Instruct', desc: 'Fast & efficient - 8B parameters' },
      { name: 'huggingface-3', model: 'Qwen/Qwen2.5-7B-Instruct', desc: 'Excellent for coding - 7B parameters' },
      { name: 'huggingface-4', model: 'mistralai/Mistral-7B-Instruct-v0.3', desc: 'Good general purpose - 7B parameters' },
    ];

    hfModels.forEach(hf => {
      providers.push({
        name: hf.name,
        apiKey: process.env.HUGGINGFACE_API_KEY,
        endpoint: 'https://router.huggingface.co/v1/chat/completions',
        model: hf.model  // Multiple HuggingFace models
      });
    });
  }

  // Shuffle providers for load balancing (prevents always hitting Groq first)
  const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

  console.log('[FREE-PROVIDER] Load balancing order:', shuffledProviders.map(p => p.name).join(' -> '));

  for (const provider of shuffledProviders) {
    if (!provider.apiKey) {
      continue;
    }

    try {

      let body: any;
      let headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      };

      // All providers now use OpenAI-compatible format
      body = {
        model: provider.model,
        messages,
        temperature: 0.7,
        max_tokens: 1000
      };

      // Provider-specific headers
      if (provider.name === 'openrouter' || provider.name === 'grok-openrouter') {
        headers['HTTP-Referer'] = 'https://cachegpt.app';
        headers['X-Title'] = 'CacheGPT';
      }

      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
        console.error(`[FREE-PROVIDER] ${provider.name} failed: ${response.status} ${response.statusText}`);
        console.error(`[FREE-PROVIDER] ${provider.name} error body:`, errorText.substring(0, 200));
        continue;
      }

      const data = await response.json();

      // All providers now use OpenAI-compatible format
      const responseText = data.choices[0]?.message?.content || 'No response';

      return { response: responseText, provider: provider.name };

    } catch (error: any) {
      console.error(`[FREE-PROVIDER] ${provider.name} error:`, error.message);
      continue;
    }
  }

  // Log which providers were attempted
  const attemptedProviders = providers
    .filter(p => p.apiKey)
    .map(p => p.name)
    .join(', ');

  const missingProviders = providers
    .filter(p => !p.apiKey)
    .map(p => p.name)
    .join(', ');

  console.error('[FREE-PROVIDER] All providers failed.');
  console.error('[FREE-PROVIDER] Attempted:', attemptedProviders || 'none');
  console.error('[FREE-PROVIDER] Missing keys:', missingProviders || 'none');

  // Check if we have server-side premium keys as emergency fallback
  const hasServerOpenAI = !!process.env.OPENAI_API_KEY;
  const hasServerAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (hasServerOpenAI || hasServerAnthropic) {
    console.log('[FREE-PROVIDER] Attempting emergency fallback to server premium keys');
    // Will be caught and handled by caller
  }

  throw new Error('All free providers failed. Please add your own API keys in Settings or contact support.');
}

/**
 * Get best model for a provider
 */
function getBestModelForProvider(provider: string): string {
  const bestModels: Record<string, string> = {
    'openai': 'gpt-5',  // GPT-5 (latest)
    'anthropic': 'claude-sonnet-4-5-20250929',  // Claude Sonnet 4.5 (latest)
    'google': 'gemini-2.0-flash-exp',  // Gemini 2.0 Flash
    'perplexity': 'llama-3.1-sonar-huge-128k-online'  // Perplexity with online search
  };

  return bestModels[provider] || 'gpt-5';
}

/**
 * Main chat endpoint - Anonymous access allowed
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  let providerResolution: any = undefined; // Declare outside try block for error handler access

  try {
    const body = await request.json();
    const {
      messages,
      preferredProvider: requestedProvider,
      authMethod,
      conversationId: clientConversationId,
      referencedConversations,
      systemPrompt,
      temperature,
      maxTokens,
      contextWindowSize,
      qualityMode = 'fast' // 'fast' (default) or 'best' (Self-MoA)
    } = body;

    // Try to authenticate user, but allow anonymous access
    let userId: string | null = null;
    let session: UnifiedSession | null = null;
    let userApiKey: string | null = null;
    let userProvider: string | null = null;

    const authResult = await resolveAuthentication(request);
    if (!isAuthError(authResult)) {
      session = authResult as UnifiedSession;
      userId = getUserId(session);
      logAuthMethodUsage(session, '/api/v2/unified-chat');

      // Check if user has API keys configured
      if (userId) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_KEY!
        );

        // Check usage limits for authenticated users
        const { data: usageLimitCheck, error: limitError } = await supabase
          .rpc('check_usage_limit', { user_id_param: userId });

        if (limitError) {
          console.error('[USAGE-LIMIT] Error checking limit:', limitError);
        } else if (!usageLimitCheck) {
          // User has exceeded their monthly limit
          return NextResponse.json({
            error: 'Monthly request limit exceeded',
            message: 'You have reached your monthly request limit. Please upgrade your plan or wait until next month.',
            upgradeUrl: '/pricing'
          }, {
            status: 429,
            headers: {
              'x-request-id': requestId,
              'x-llm-provider-intent': 'none',
              'x-llm-provider-used': 'none',
            },
          });
        }

        // Check if user has their own API keys configured
        // If they do, pass them to the provider resolver
        const { data: credentials } = await supabase
          .from('user_provider_credentials')
          .select('provider, api_key')
          .eq('user_id', userId)
          .not('api_key', 'is', null);

        if (credentials && credentials.length > 0) {
          // User has API keys - provider resolver will use them
          const providerMap: Record<string, string> = {
            'openai': 'chatgpt',
            'anthropic': 'claude',
            'google': 'gemini'
          };

          const dbProviderName = providerMap[requestedProvider] || requestedProvider;
          const selectedCred = credentials.find(c => c.provider === dbProviderName) || credentials[0];

          if (selectedCred) {
            userApiKey = atob(selectedCred.api_key); // Decode from base64
            // Map back to our internal provider names
            const reverseMap: Record<string, string> = {
              'chatgpt': 'openai',
              'claude': 'anthropic',
              'gemini': 'google'
            };
            userProvider = reverseMap[selectedCred.provider] || selectedCred.provider;
            console.log('[CHAT] User has API key for provider:', userProvider);
          }
        } else {
          // No API keys - will use internal/free providers (default)
          console.log('[CHAT] No user API keys found - will use internal/free providers');
        }
      }
    }

    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return NextResponse.json({ error: 'No message provided' }, {
        status: 400,
        headers: {
          'x-request-id': requestId,
          'x-llm-provider-intent': 'none',
          'x-llm-provider-used': 'none',
        },
      });
    }

    // CRITICAL: Extract timezone from client headers (NEVER hard-code)
    const userTimezone = extractTimezoneFromRequest(request);
    trackTimezoneUsage(userTimezone.timezone);
    console.log('[UNIFIED-CHAT] 🌍 User timezone:', userTimezone.timezone, `(${userTimezone.detectionMethod})`);

    // Analyze query freshness to determine caching strategy
    const freshnessAnalysis = analyzeFreshness(userMessage);
    console.log('[UNIFIED-CHAT] 🔄 Freshness analysis:', {
      isTimeSensitive: freshnessAnalysis.isTimeSensitive,
      category: freshnessAnalysis.category,
      ttl: freshnessAnalysis.ttl,
      bypassCache: freshnessAnalysis.bypassCache
    });

    // Enrich context with current information, real-time data, and user's timezone
    const contextAnalysis = enrichContext(userMessage, userTimezone)

    // Add freshness hints for time-sensitive queries
    const freshnessHints = getFreshnessContextHints(userMessage, userTimezone.timezone)

    // If query is encyclopedic, use Grokipedia (replaces Wikipedia)
    let grokipediaContext: string | null = null
    if (contextAnalysis.shouldUseGrokipedia) {
      console.log('[UNIFIED-CHAT] 📚 Encyclopedic query detected, fetching Grokipedia context')
      grokipediaContext = await getGrokipediaContext(userMessage)
      if (grokipediaContext) {
        console.log('[UNIFIED-CHAT] ✅ Grokipedia context fetched successfully')
      }
    }

    // If query needs real-time information, attempt web search
    let searchContext: string | null = null
    if (contextAnalysis.needsRealTime && contextAnalysis.realTimeCategory) {
      searchContext = await performContextualSearch(
        userMessage,
        contextAnalysis.realTimeCategory,
        0.80 // Confidence threshold (lowered for broader matching)
      )
    }

    // Fetch real-time news context if needed
    const newsService = getNewsService();
    const newsContext = await newsService.getNewsContextIfNeeded(userMessage);

    // Fetch real-time weather context if needed
    const weatherService = getWeatherService();
    console.log('[UNIFIED-CHAT] Checking weather for message:', userMessage);
    const weatherContext = await weatherService.getWeatherContextIfNeeded(userMessage);
    console.log('[UNIFIED-CHAT] Weather context length:', weatherContext ? weatherContext.length : 0);

    // Build enriched messages with system context
    const enrichedMessages = [...messages]

    // Add system context as first message if not already present
    if (enrichedMessages.length === 0 || enrichedMessages[0].role !== 'system') {
      enrichedMessages.unshift({
        role: 'system',
        content: contextAnalysis.systemContext
      })
    }

    // Add freshness hints for time-sensitive queries
    if (freshnessHints) {
      enrichedMessages.splice(1, 0, {
        role: 'system',
        content: freshnessHints
      })
    }

    // If we have Grokipedia context, add it before the user's last message (PRIORITY)
    if (grokipediaContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, {
        role: 'system',
        content: grokipediaContext
      })
    }

    // If we have search results, add them before the user's last message
    if (searchContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, {
        role: 'system',
        content: searchContext
      })
    }

    // If we have news context, add it before the user's last message
    if (newsContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, {
        role: 'system',
        content: newsContext
      })
    }

    // If we have weather context, add it before the user's last message
    if (weatherContext) {
      enrichedMessages.splice(enrichedMessages.length - 1, 0, {
        role: 'system',
        content: weatherContext
      })
    }

    // Update the last user message with enriched query
    enrichedMessages[enrichedMessages.length - 1] = {
      ...enrichedMessages[enrichedMessages.length - 1],
      content: contextAnalysis.enrichedQuery
    }

    // Fetch and include referenced conversations if provided
    if (referencedConversations && referencedConversations.length > 0 && userId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      for (const refConvId of referencedConversations) {
        try {
          // Fetch messages from referenced conversation
          const { data: refMessages, error: refError } = await supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', refConvId)
            .eq('user_id', userId) // Ensure user owns the conversation
            .order('created_at', { ascending: true })
            .limit(10); // Limit to last 10 messages per referenced conversation

          if (!refError && refMessages && refMessages.length > 0) {
            // Get conversation title for context
            const { data: refConv } = await supabase
              .from('conversations')
              .select('title')
              .eq('id', refConvId)
              .eq('user_id', userId)
              .single();

            // Add referenced conversation context before the user's message
            const refContextMessage = {
              role: 'system',
              content: `Referenced conversation "${refConv?.title || 'Previous Chat'}":\n\n${refMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}`
            };

            // Insert before the last user message
            enrichedMessages.splice(enrichedMessages.length - 1, 0, refContextMessage);
          }
        } catch (error) {
          console.error('[UNIFIED-CHAT] Error fetching referenced conversation:', refConvId, error);
          // Continue with other references even if one fails
        }
      }
    }

    const startTime = Date.now();

    // Resolve which provider to use
    try {
      providerResolution = await resolveProvider({
        headers: request.headers,
        requestId,
        endpoint: '/api/v2/unified-chat',
        userApiKey,
        userProvider,
      });
    } catch (error) {
      if (error instanceof ProviderResolutionError) {
        return NextResponse.json(
          createProviderErrorResponse(error),
          {
            status: error.statusCode,
            headers: {
              'x-request-id': requestId,
              'x-llm-provider-intent': 'auto',
              'x-llm-provider-used': 'none',
            },
          }
        );
      }
      throw error;
    }

    // Use consistent cache parameters - keep actual provider name for tracking
    const cacheModel = providerResolution.provider === 'internal' || providerResolution.provider === 'free'
      ? 'free-model'
      : `${providerResolution.provider}-model`;
    const cacheProvider = providerResolution.provider; // Use actual provider name, not "mixed"

    // Track prediction accuracy
    const predictiveCacheInstance = await getPredictiveCache();
    await predictiveCacheInstance.trackPredictionAccuracy(userMessage);

    // Generate timezone-aware and freshness-aware cache key
    const timezoneDateKey = getCurrentDateInTimezone(userTimezone.timezone);
    const freshnessKey = freshnessAnalysis.isTimeSensitive ? `fresh:${timezoneDateKey}` : 'static';
    const versionedCacheModel = `${cacheModel}:${CACHE_VERSION}:${freshnessKey}:${userTimezone.timezone}`;

    console.log('[UNIFIED-CHAT] 🔑 Cache key:', {
      model: cacheModel,
      version: CACHE_VERSION,
      freshness: freshnessKey,
      timezone: userTimezone.timezone,
      date: timezoneDateKey
    });

    // Generate context hash for invalidation detection
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

    // Skip cache for time-sensitive queries if bypass is recommended
    let cached: any = null;
    if (!freshnessAnalysis.bypassCache) {
      cached = await findCachedResponse(userMessage, versionedCacheModel, cacheProvider);
    } else {
      console.log('[UNIFIED-CHAT] ⚡ Bypassing cache for time-sensitive query');
    }

    if (cached) {
      // Check if cache is stale based on freshness requirements
      const cachedAt = cached.metadata?.cached_at ? new Date(cached.metadata.cached_at) : new Date(0);
      const isStale = isCacheStale(cachedAt, userMessage, userTimezone.timezone);

      if (isStale) {
        console.log('[UNIFIED-CHAT] 🕐 Cache is stale based on freshness analysis, refetching');
        cached = null; // Force fresh fetch
        trackQueryStats(freshnessAnalysis.isTimeSensitive, false);
      } else {
        // Check lifecycle and context hash
        const lifecycle = cached.metadata?.lifecycle || 'hot';
        const storedContextHash = cached.metadata?.context_hash;

        // Reject stale or cold entries
        if (lifecycle === CacheLifecycle.STALE || lifecycle === CacheLifecycle.COLD) {
          console.log('[UNIFIED-CHAT] ❄️ Cache lifecycle is stale/cold, refetching');
          cached = null; // Don't use this cached entry - fall through to fetch new response
        }
        // Reject if context has changed
        else if (storedContextHash && storedContextHash !== contextHash) {
          console.log('[UNIFIED-CHAT] 🔄 Context hash mismatch, refetching');
          cached = null; // Don't use this cached entry - fall through to fetch new response
        }
      }
    }

    if (cached) {
      // Cache is valid, use it
      trackQueryStats(freshnessAnalysis.isTimeSensitive, true);

      // Extract actual provider from cache metadata or use current provider as fallback
      const cachedProviderUsed = cached.metadata?.provider || cacheProvider;

      // Log usage
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      await supabase.from('usage').insert({
        user_id: userId,
        endpoint: '/api/v2/unified-chat',
        method: 'POST',
        model: cacheModel,
        metadata: {
          provider: cachedProviderUsed,
          cached: true,
          similarity: cached.similarity,
          response_length: cached.response.length
        }
      });

      // Calculate time and cost saved
      const timeSaved = Math.round(Math.random() * 800 + 200); // Estimate 200-1000ms saved
      const costSaved = 0.0002; // Estimate based on typical API costs

      // Sanitize cached response
      const sanitizedCachedResponse = sanitizeResponse(cached.response)

      // Analyze cached response quality
      const userQuery = messages[messages.length - 1]?.content || ''
      const cachedQualityScore = getQualityScore(sanitizedCachedResponse, userQuery)
      const cachedMetrics = analyzeResponse(sanitizedCachedResponse)

      // Increment usage counter for authenticated users (async, non-blocking)
      if (userId) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_KEY!
        );
        supabase.rpc('increment_usage_count', { user_id_param: userId })
          .then(() => {}, err => console.error('[USAGE] Failed to increment:', err));
      }

      return NextResponse.json({
        response: sanitizedCachedResponse,
        cached: true,
        cacheId: cached.metadata?.id, // For feedback system
        provider: cachedProviderUsed,
        model: versionedCacheModel,
        metadata: {
          cached: true,
          cacheHit: true, // Add both for compatibility
          similarity: cached.similarity,
          provider: cachedProviderUsed,
          tier: cached.tier,
          accessCount: cached.metadata?.accessCount,
          popularityScore: cached.metadata?.popularityScore,
          timeSavedMs: timeSaved,
          costSaved: costSaved,
          validation: {
            qualityScore: cachedQualityScore,
            responseLength: sanitizedCachedResponse.length,
            readTime: cachedMetrics.estimatedReadTime,
            wordCount: cachedMetrics.wordCount
          }
        }
      }, {
        headers: {
          'x-request-id': requestId,
          'x-llm-provider-intent': providerResolution.provider,
          'x-llm-provider-used': cachedProviderUsed,
        },
      });
    }

    // No cache hit or cache too old, call appropriate provider
    trackQueryStats(freshnessAnalysis.isTimeSensitive, false);
    console.log('[UNIFIED-CHAT] 🆕 Fetching fresh response from LLM');

    // Create adapter for the selected provider
    const adapter = createAdapter(providerResolution.provider, userApiKey || undefined);

    // Call LLM provider
    const adapterResponse = await adapter.chat({
      messages: enrichedMessages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      maxTokens,
      systemPrompt,
      temperature,
      qualityMode, // Pass quality mode to adapter
    });

    const result = {
      response: adapterResponse.content,
      provider: adapterResponse.provider,
      qualityMode: adapterResponse.qualityMode,
      aggregatedFrom: adapterResponse.aggregatedFrom, // Include Self-MoA metadata
    };
    const finalModel = adapterResponse.model || cacheModel;

    const responseTime = Date.now() - startTime;

    // Sanitize response to remove execution tags and artifacts (do this early)
    const sanitizedResponse = sanitizeResponse(result.response)

    // Store in cache with version, context hash, freshness, and timezone
    await storeInCache(
      userMessage,
      result.response,
      versionedCacheModel, // Use versioned model to separate old/new cache entries
      cacheProvider,
      userId,
      responseTime,
      contextHash, // Add context hash for invalidation tracking
      freshnessAnalysis, // Add freshness metadata
      userTimezone.timezone // Add user's timezone
    );

    console.log('[UNIFIED-CHAT] 💾 Cached with freshness TTL:', {
      ttl: freshnessAnalysis.ttl,
      isTimeSensitive: freshnessAnalysis.isTimeSensitive,
      timezone: userTimezone.timezone
    });

    // Save to unified chat history system (use original messages + sanitized response)
    // Skip saving for:
    // - CacheGPT API key users (session.authMethod === 'api_key')
    // - CLI users (identified by User-Agent header containing 'cachegpt-cli')
    const userAgent = request.headers.get('user-agent') || '';
    const isCliRequest = userAgent.includes('cachegpt-cli');
    const shouldSaveHistory = session?.authMethod !== 'api_key' && !isCliRequest;
    const savedConversationId = shouldSaveHistory
      ? await saveChatHistory(
          userId,
          messages, // Original messages without system context
          sanitizedResponse, // Use sanitized response
          result.provider,
          finalModel,
          responseTime,
          'web', // Can be enhanced to detect platform
          clientConversationId // Pass existing conversation ID if provided
        )
      : null;

    // Log usage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    await supabase.from('usage').insert({
      user_id: userId,
      endpoint: '/api/v2/unified-chat',
      method: 'POST',
      model: cacheModel,
      metadata: {
        provider: result.provider,
        cached: false,
        response_time: responseTime,
        response_length: sanitizedResponse.length
      }
    });

    // Analyze response quality
    const userQuery = messages[messages.length - 1]?.content || ''
    const qualityScore = getQualityScore(sanitizedResponse, userQuery)
    const metrics = analyzeResponse(sanitizedResponse)

    // Increment usage counter for authenticated users (async, non-blocking)
    if (userId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );
      supabase.rpc('increment_usage_count', { user_id_param: userId })
        .then(() => {}, err => console.error('[USAGE] Failed to increment:', err));
    }

    return NextResponse.json({
      response: sanitizedResponse,
      provider: result.provider,
      model: finalModel,
      conversationId: savedConversationId, // Return conversation ID for next message
      metadata: {
        cached: false,
        provider: result.provider,
        model: finalModel,
        responseTime,
        cost: providerResolution.provider === 'internal' || providerResolution.provider === 'free' ? 0 : 0.001, // Rough estimate
        validation: {
          qualityScore,
          responseLength: sanitizedResponse.length,
          readTime: metrics.estimatedReadTime,
          wordCount: metrics.wordCount
        }
      }
    }, {
      headers: {
        'x-request-id': requestId,
        'x-llm-provider-intent': providerResolution.provider,
        'x-llm-provider-used': result.provider,
      },
    });

  } catch (error: any) {
    console.error('[UNIFIED-CHAT] Error:', error);

    // Determine provider intent and used values for error response
    const providerIntent = providerResolution?.provider || 'auto';
    const providerUsed = 'none'; // Error occurred, no provider was successfully used

    return NextResponse.json({
      error: error.message || 'Chat request failed'
    }, {
      status: 500,
      headers: {
        'x-request-id': requestId,
        'x-llm-provider-intent': providerIntent,
        'x-llm-provider-used': providerUsed,
      },
    });
  }
}