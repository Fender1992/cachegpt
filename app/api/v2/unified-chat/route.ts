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
 * - v3-weather: Added 7-day weather forecast context (v12.17.0+)
 * - v4-weather: Fixed weather pipeline (location extraction, timezone headers, API errors) (v12.18.0+)
 */
const CACHE_VERSION = 'v4-weather';

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

      // Atomic access count increment (avoids race condition)
      await supabase.rpc('increment_cache_access', { cache_id: bestMatch.id });

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
 * Find cached response by exact query + external context hash match
 */
async function findExactContextMatch(
  query: string,
  contextHash: string,
  model: string,
  provider: string
): Promise<any | null> {
  try {
    const { createHash } = await import('crypto');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Generate query hash (same algorithm as DB computed column)
    const queryHash = createHash('sha256').update(query).digest('hex');

    const { data, error } = await supabase
      .from('cached_responses')
      .select('*')
      .eq('query_hash', queryHash)
      .eq('external_context_hash', contextHash)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Atomic access count increment (fire and forget)
    supabase.rpc('increment_cache_access', { cache_id: data.id });

    return data;
  } catch (error) {
    console.error('[EXACT-CONTEXT-MATCH] Error:', error);
    return null;
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
  conversationId?: string,
  uploadedFiles?: any[]
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
      conversationId = data.id;

      // Link uploaded files to the new conversation
      if (uploadedFiles && uploadedFiles.length > 0) {
        const fileIds = uploadedFiles.map((f: any) => f.id)
        const { error: linkError } = await supabase
          .from('conversation_files')
          .update({ conversation_id: conversationId })
          .in('id', fileIds)
          .eq('user_id', userId)

        if (linkError) {
          console.error('[CHAT-HISTORY] Error linking files to conversation:', linkError)
        }
      }
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
  timezone?: string,
  externalContextHash?: string,  // NEW: from API request
  externalContextType?: string   // NEW: from API request
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
        lifecycle_updated_at: new Date().toISOString(),
        // External context metadata (NEW)
        external_context_hash: externalContextHash || null,
        external_context_type: externalContextType || null
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
      qualityMode = 'fast', // 'fast' (default) or 'best' (Self-MoA)
      uploadedFiles,
      contextHash: externalContextHash,    // NEW: e.g., "job_123" - stored as external_context_hash in DB
      contextData,                          // NEW: { title, company, ghostScore, ... }
      contextType: externalContextType      // NEW: "job" | "product" | "company" | etc
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
          // User has exceeded their daily limit
          return NextResponse.json({
            error: 'Daily request limit reached',
            message: "You've reached your daily limit of 500 requests. Try again tomorrow! CacheGPT is free forever.",
            donateUrl: '/donate'
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
          }
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

    // Analyze query freshness to determine caching strategy
    const freshnessAnalysis = analyzeFreshness(userMessage);

    // Enrich context with current information, real-time data, and user's timezone
    const contextAnalysis = enrichContext(userMessage, userTimezone)

    // Add freshness hints for time-sensitive queries
    const freshnessHints = getFreshnessContextHints(userMessage, userTimezone.timezone)

    // If query is encyclopedic, use Grokipedia (replaces Wikipedia)
    let grokipediaContext: string | null = null
    if (contextAnalysis.shouldUseGrokipedia) {
      grokipediaContext = await getGrokipediaContext(userMessage)
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

    // NEW: Inject external context data if provided
    if (contextData && Object.keys(contextData).length > 0) {
      const { buildSystemPromptWithContext } = await import('@/lib/context-formatters');

      const contextPrompt = buildSystemPromptWithContext(
        null,
        contextData,
        externalContextType
      );

      if (contextPrompt) {
        enrichedMessages.splice(enrichedMessages.length - 1, 0, {
          role: 'system',
          content: contextPrompt
        });
      }
    }

    // Integration context (GitHub repos, Discord messages, Gmail, Calendar, Slack, Teams, Notion, Drive, Jira)
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
        const calendarAnalysis = analyzeCalendarQuery(userMessage);
        if (calendarAnalysis.intent === 'create_event' || calendarAnalysis.intent === 'delete_event' || calendarAnalysis.intent === 'update_event') {
          hasIntegrationWriteAction = true;
        }
        const calendarContext = await retrieveCalendarContext(userId, userMessage, userTimezone.timezone);
        if (calendarContext) {
          enrichedMessages.splice(enrichedMessages.length - 1, 0,
            { role: 'system', content: `## Connected Integration: Google Calendar\n\nYou have direct access to the user's Google Calendar. You can create, read, update, and delete events on their behalf. The calendar action has already been executed server-side — use the result below to respond naturally.\n\n${calendarContext}` });
        } else if (hasIntegrationWriteAction && (calendarAnalysis.intent === 'create_event' || calendarAnalysis.intent === 'delete_event' || calendarAnalysis.intent === 'update_event')) {
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

    // If we have uploaded files, retrieve their content and add to context
    if (uploadedFiles && uploadedFiles.length > 0 && userId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      // Retrieve file contents from database
      const fileIds = uploadedFiles.map((f: any) => f.id)
      const { data: files, error: filesError } = await supabase
        .from('conversation_files')
        .select('file_name, file_type, content_text, content_preview')
        .in('id', fileIds)
        .eq('user_id', userId)

      if (!filesError && files && files.length > 0) {
        // Build file context message
        let fileContext = '📎 **Attached Files:**\n\n'

        files.forEach((file: any, index: number) => {
          fileContext += `**File ${index + 1}: ${file.file_name}** (${file.file_type})\n`

          // For images, include base64 preview
          if (file.file_type.startsWith('image/')) {
            fileContext += `${file.content_text}\n\n`
          } else {
            // For text-based files, include full content
            fileContext += `\`\`\`\n${file.content_text}\n\`\`\`\n\n`
          }
        })

        fileContext += '---\n\nPlease analyze the attached files and respond to the user\'s query considering the file content.'

        // Add file context before the user's last message
        enrichedMessages.splice(enrichedMessages.length - 1, 0, {
          role: 'system',
          content: fileContext
        })

      } else if (filesError) {
        console.error('[UNIFIED-CHAT] Error fetching file contents:', filesError)
      }
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

    // NEW: External context-aware caching (exact match)
    if (externalContextHash) {
      const exactMatch = await findExactContextMatch(
        userMessage,
        externalContextHash,
        cacheModel,
        cacheProvider
      );

      if (exactMatch) {
        // Sanitize the cached response
        const sanitizedExactResponse = sanitizeResponse(exactMatch.response);

        // Increment usage counter for authenticated users
        if (userId) {
          const supabaseForUsage = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
          );
          supabaseForUsage.rpc('increment_usage_count', { user_id_param: userId })
            .then(() => {}, err => console.error('[USAGE] Failed to increment:', err));
        }

        return NextResponse.json({
          response: sanitizedExactResponse,
          cached: true,
          cacheId: exactMatch.id,
          provider: exactMatch.provider || cacheProvider,
          model: exactMatch.model || cacheModel,
          metadata: {
            cached: true,
            cacheHit: true,
            contextHash: externalContextHash,
            contextType: externalContextType,
            provider: exactMatch.provider || cacheProvider,
            tier: exactMatch.tier,
            accessCount: exactMatch.access_count,
          }
        }, {
          headers: {
            'x-request-id': requestId,
            'x-llm-provider-intent': providerResolution.provider,
            'x-llm-provider-used': exactMatch.provider || cacheProvider,
          },
        });
      }
    }

    // Skip cache for time-sensitive queries if bypass is recommended
    let cached: any = null;
    if (!freshnessAnalysis.bypassCache && !hasIntegrationWriteAction) {
      cached = await findCachedResponse(userMessage, versionedCacheModel, cacheProvider);
    }

    if (cached) {
      // Check if cache is stale based on freshness requirements
      const cachedAt = cached.metadata?.cached_at ? new Date(cached.metadata.cached_at) : new Date(0);
      const isStale = isCacheStale(cachedAt, userMessage, userTimezone.timezone);

      if (isStale) {
        cached = null; // Force fresh fetch
        trackQueryStats(freshnessAnalysis.isTimeSensitive, false);
      } else {
        // Check lifecycle and context hash
        const lifecycle = cached.metadata?.lifecycle || 'hot';
        const storedContextHash = cached.metadata?.context_hash;

        // Reject stale or cold entries
        if (lifecycle === CacheLifecycle.STALE || lifecycle === CacheLifecycle.COLD) {
          cached = null; // Don't use this cached entry - fall through to fetch new response
        }
        // Reject if context has changed
        else if (storedContextHash && storedContextHash !== contextHash) {
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
          contextHash: externalContextHash || undefined,
          contextType: externalContextType || undefined,
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
      userTimezone.timezone, // Add user's timezone
      externalContextHash, // NEW: from API request
      externalContextType  // NEW: from API request
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
          clientConversationId, // Pass existing conversation ID if provided
          uploadedFiles // Pass uploaded files to link them to conversation
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
        contextHash: externalContextHash || undefined,
        contextType: externalContextType || undefined,
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