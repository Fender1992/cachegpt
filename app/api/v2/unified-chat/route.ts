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
import { enrichContext, generateSystemContext } from '@/lib/context-enrichment';
import { performContextualSearch } from '@/lib/web-search';
import { cacheLifecycleManager, QueryType, CacheLifecycle } from '@/lib/cache-lifecycle';
import { getNewsService } from '@/lib/news-service';
import { getWeatherService } from '@/lib/weather-service';

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
 */
async function storeInCache(
  query: string,
  response: string,
  model: string,
  provider: string,
  userId: string | null,
  responseTimeMs: number,
  contextHash?: string
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
      console.error('[TIER-CACHE] Failed to store response');
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
          created_by_user: userId
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
  model: string
): Promise<{ response: string; provider: string }> {
  try {
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
          model: model,  // Use the auto-selected best model
          messages,
          temperature: 0.7,
          max_tokens: 2000
        };
        break;

      case 'anthropic':
      case 'claude':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: model,  // Use the auto-selected best model
          messages: messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          })),
          max_tokens: 2000
        };
        break;

      case 'google':
      case 'gemini':
        // Extract model name from full model ID (e.g., "gemini-2.0-flash-exp" -> "gemini-2.0-flash-exp")
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        body = {
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }))
        };
        break;

      case 'perplexity':
        endpoint = 'https://api.perplexity.ai/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: model,  // Use the auto-selected best model
          messages,
          temperature: 0.7
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
      name: 'huggingface',
      apiKey: process.env.HUGGINGFACE_API_KEY,
      endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1'  // Mixtral 8x7B (stable fallback)
    }
  ];

  // Shuffle providers for load balancing (prevents always hitting Groq first)
  const shuffledProviders = [...providers].sort(() => Math.random() - 0.5);

  console.log('[FREE-PROVIDER] Load balancing order:', shuffledProviders.map(p => p.name).join(' -> '));

  for (const provider of shuffledProviders) {
    if (!provider.apiKey) {
      continue;
    }

    try {

      let body: any;
      let headers: any = { 'Content-Type': 'application/json' };

      if (provider.name === 'huggingface') {
        body = {
          inputs: messages.map(m => m.content).join('\n'),
          parameters: { max_new_tokens: 1000, temperature: 0.7 }
        };
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      } else {
        body = {
          model: provider.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        };
        headers['Authorization'] = `Bearer ${provider.apiKey}`;

        if (provider.name === 'openrouter') {
          headers['HTTP-Referer'] = 'https://cachegpt.app';
          headers['X-Title'] = 'CacheGPT';
        }
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
      let responseText: string;

      if (provider.name === 'huggingface') {
        responseText = data[0]?.generated_text || data.generated_text || 'No response';
      } else {
        responseText = data.choices[0]?.message?.content || 'No response';
      }

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
  try {
    const body = await request.json();
    const { messages, preferredProvider: requestedProvider, authMethod, conversationId: clientConversationId } = body;

    // Try to authenticate user, but allow anonymous access
    let userId: string | null = null;
    let session: UnifiedSession | null = null;
    let userApiKey: string | null = null;
    let selectedProvider: string = requestedProvider || 'auto';
    let selectedModel: string | null = null;

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
          }, { status: 429 });
        }

        // Check if user has their own API keys configured
        // If they do, use their keys for flagship models
        // Otherwise, use free providers (default for all users)
        const { data: credentials } = await supabase
          .from('user_provider_credentials')
          .select('provider, api_key')
          .eq('user_id', userId)
          .not('api_key', 'is', null);

        if (credentials && credentials.length > 0) {
          // User has API keys - use their flagship models
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
            selectedProvider = reverseMap[selectedCred.provider] || selectedCred.provider;
            selectedModel = getBestModelForProvider(selectedProvider);
            console.log('[CHAT] Using user API key for flagship model:', selectedModel);
          }
        } else {
          // No API keys - use free providers (default)
          console.log('[CHAT] No user API keys found - using free providers');
        }
      }
    } else {
      selectedProvider = 'auto';
    }

    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // Enrich context with current information and real-time data
    const contextAnalysis = enrichContext(userMessage)

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
    const weatherContext = await weatherService.getWeatherContextIfNeeded(userMessage);

    // Build enriched messages with system context
    const enrichedMessages = [...messages]

    // Add system context as first message if not already present
    if (enrichedMessages.length === 0 || enrichedMessages[0].role !== 'system') {
      enrichedMessages.unshift({
        role: 'system',
        content: contextAnalysis.systemContext
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

    const startTime = Date.now();

    // Determine if using free providers or user's API key
    const usingFreeProviders = !userApiKey || selectedProvider === 'auto';

    // Use consistent cache parameters
    const cacheModel = usingFreeProviders ? 'free-model' : `${selectedProvider}-model`;
    const cacheProvider = usingFreeProviders ? 'mixed' : selectedProvider;

    // Track prediction accuracy
    const predictiveCacheInstance = await getPredictiveCache();
    await predictiveCacheInstance.trackPredictionAccuracy(userMessage);

    // Check cache using lifecycle-aware system (replaces version + TTL)
    const versionedCacheModel = `${cacheModel}:${CACHE_VERSION}`;

    // Generate context hash for invalidation detection
    const contextHash = cacheLifecycleManager.generateContextHash({
      enrichedQuery: contextAnalysis.enrichedQuery,
      systemContext: contextAnalysis.systemContext,
      searchContext,
      newsContext,
      weatherContext,
      version: CACHE_VERSION
    });

    const cached = await findCachedResponse(userMessage, versionedCacheModel, cacheProvider);

    if (cached) {
      // Check lifecycle and context hash
      const lifecycle = cached.metadata?.lifecycle || 'hot';
      const storedContextHash = cached.metadata?.context_hash;

      // Reject stale or cold entries
      if (lifecycle === CacheLifecycle.STALE || lifecycle === CacheLifecycle.COLD) {
        // Don't use this cached entry - fall through to fetch new response
      }
      // Reject if context has changed
      else if (storedContextHash && storedContextHash !== contextHash) {
        // Don't use this cached entry - fall through to fetch new response
      }
      else {
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
          provider: cacheProvider,
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
        metadata: {
          cached: true,
          cacheHit: true, // Add both for compatibility
          similarity: cached.similarity,
          provider: cacheProvider,
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
      });
      }
    }

    // No cache hit or cache too old, call appropriate provider
    let result: { response: string; provider: string };
    let finalModel: string;

    if (usingFreeProviders) {
      // Use free providers (auto-rotates between Groq, OpenRouter, HuggingFace)
      try {
        result = await callFreeProvider(enrichedMessages);
        finalModel = 'free-model';  // Don't expose which specific free model was used
      } catch (freeProviderError: any) {
        // If free providers fail and we have server premium keys, use them as emergency fallback
        if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
          console.log('[EMERGENCY-FALLBACK] Free providers failed, using server premium keys');
          const fallbackProvider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
          const fallbackKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
          const fallbackModel = fallbackProvider === 'anthropic'
            ? 'claude-sonnet-4-5-20250929'
            : 'gpt-5';

          result = await callPremiumProvider(enrichedMessages, fallbackProvider, fallbackKey!, fallbackModel);
          finalModel = fallbackModel;
        } else {
          // No fallback available, re-throw the error
          throw freeProviderError;
        }
      }
    } else {
      // Use premium provider with user's API key
      try {
        result = await callPremiumProvider(enrichedMessages, selectedProvider, userApiKey!, selectedModel!);
        finalModel = selectedModel!;
      } catch (error) {
        console.error('[CHAT] Premium provider failed, falling back to free providers');
        result = await callFreeProvider(enrichedMessages);
        finalModel = 'free-model';
      }
    }

    const responseTime = Date.now() - startTime;

    // Sanitize response to remove execution tags and artifacts (do this early)
    const sanitizedResponse = sanitizeResponse(result.response)

    // Store in cache with version and context hash for lifecycle management
    await storeInCache(
      userMessage,
      result.response,
      versionedCacheModel, // Use versioned model to separate old/new cache entries
      cacheProvider,
      userId,
      responseTime,
      contextHash // Add context hash for invalidation tracking
    );

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
        cost: usingFreeProviders ? 0 : 0.001, // Rough estimate
        validation: {
          qualityScore,
          responseLength: sanitizedResponse.length,
          readTime: metrics.estimatedReadTime,
          wordCount: metrics.wordCount
        }
      }
    });

  } catch (error: any) {
    console.error('[UNIFIED-CHAT] Error:', error);
    return NextResponse.json({
      error: error.message || 'Chat request failed'
    }, { status: 500 });
  }
}