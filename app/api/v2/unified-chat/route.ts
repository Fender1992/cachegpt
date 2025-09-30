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
 * Simple embedding generation for cache similarity
 */
function generateSimpleEmbedding(text: string): number[] {
  const embedding = new Array(384).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      embedding[(i * 10 + j) % 384] += (charCode / 255) - 0.5;
    }
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}

/**
 * Calculate cosine similarity between embeddings
 */
function calculateSimilarity(embedding1: number[], embedding2: number[]): number {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

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
      console.log(`[TIER-CACHE] Found cached response in ${cached.tier} tier with ${Math.round(cached.similarity * 100)}% similarity`);
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

      const queryEmbedding = generateSimpleEmbedding(query);

      console.log(`[CACHE-SEARCH-FALLBACK] Looking for: model=${model}, provider=${provider}, query="${query.substring(0, 50)}..."`);

      // Get potential matches from database
      const { data: candidates, error: dbError } = await supabase
        .from('cached_responses')
        .select('*')
        .eq('model', model)
        .eq('provider', provider)
        .eq('is_archived', false)
        .order('popularity_score', { ascending: false })
        .limit(50);

      if (dbError) {
        console.error('[CACHE-SEARCH-FALLBACK] Database error:', dbError);
        return null;
      }

      if (!candidates || candidates.length === 0) {
        console.log('[CACHE-SEARCH-FALLBACK] No candidates found');
        return null;
      }

      console.log(`[CACHE-SEARCH-FALLBACK] Found ${candidates.length} candidates, checking similarity...`);

      // Find best match
      let bestMatch = null;
      let bestSimilarity = 0;

      for (const candidate of candidates) {
        if (!candidate.embedding) continue;

        const similarity = calculateSimilarity(queryEmbedding, candidate.embedding);
        if (similarity >= threshold && similarity > bestSimilarity) {
          bestMatch = candidate;
          bestSimilarity = similarity;
        }
      }

      if (bestMatch) {
        console.log(`[CACHE-HIT-FALLBACK] Found match with ${Math.round(bestSimilarity * 100)}% similarity`);

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
          similarity: bestSimilarity,
          cached: true
        };
      }

      console.log('[CACHE-MISS-FALLBACK] No similar responses found');
      return null;

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
  platform: string = 'web'
) {
  if (!userId) {
    console.log('[CHAT-HISTORY] Skipping save - anonymous user');
    return;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const userMessage = messages[messages.length - 1];

    // Create or get existing conversation
    // For now, create a new conversation for each chat (can be optimized later)
    const { data: conversation, error: convError } = await supabase
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
      return;
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
    } else {
      console.log(`[CHAT-HISTORY] ✅ Saved conversation ${conversation.id} for user ${userId}`);
    }

  } catch (error) {
    console.error('[CHAT-HISTORY] Error saving chat history:', error);
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
  responseTimeMs: number
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

    if (responseId) {
      console.log(`[TIER-CACHE] ✅ Stored response with ID: ${responseId}`);
    } else {
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

      const embedding = generateSimpleEmbedding(query);

      console.log(`[CACHE-STORE-FALLBACK] Storing: model=${model}, provider=${provider}, user=${userId}`);

      const insertData = {
        query,
        response,
        model,
        provider,
        embedding,
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
        created_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        last_score_update: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('cached_responses')
        .insert(insertData)
        .select('id');

      if (error) {
        console.error('[CACHE-STORE-FALLBACK] Database error:', error);
      } else {
        console.log(`[CACHE-STORE-FALLBACK] ✅ Stored response with ID: ${data?.[0]?.id}`);
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
  console.log(`[PREMIUM-PROVIDER] Calling ${provider} with user's API key`);

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

    console.log(`[PREMIUM-PROVIDER] ✅ Success with ${provider}`);
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

  for (const provider of providers) {
    if (!provider.apiKey) {
      console.log(`[FREE-PROVIDER] ${provider.name} has no API key`);
      continue;
    }

    try {
      console.log(`[FREE-PROVIDER] Trying ${provider.name}...`);

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
        const error = await response.text();
        console.log(`[FREE-PROVIDER] ${provider.name} failed: ${error}`);
        continue;
      }

      const data = await response.json();
      let responseText: string;

      if (provider.name === 'huggingface') {
        responseText = data[0]?.generated_text || data.generated_text || 'No response';
      } else {
        responseText = data.choices[0]?.message?.content || 'No response';
      }

      console.log(`[FREE-PROVIDER] ✅ Success with ${provider.name}`);
      return { response: responseText, provider: provider.name };

    } catch (error: any) {
      console.error(`[FREE-PROVIDER] ${provider.name} error:`, error.message);
      continue;
    }
  }

  throw new Error('All free providers failed');
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
    const { messages, preferredProvider: requestedProvider, authMethod } = body;

    console.log('[UNIFIED-CHAT] Request:', { requestedProvider, authMethod, messageCount: messages?.length });

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
      console.log('[UNIFIED-CHAT] Authenticated user:', userId);

      // Check if user has API keys configured
      if (userId) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_KEY!
        );

        // Check user profile for enterprise mode
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('enterprise_mode, selected_provider')
          .eq('user_id', userId)
          .single();

        if (profile?.enterprise_mode) {
          // Get user's API keys
          const { data: credentials } = await supabase
            .from('user_provider_credentials')
            .select('provider, api_key')
            .eq('user_id', userId)
            .not('api_key', 'is', null);

          if (credentials && credentials.length > 0) {
            // If user specified a provider, use that; otherwise use first available
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
              console.log(`[UNIFIED-CHAT] Using user's ${selectedProvider} API key with model ${selectedModel}`);
            }
          }
        }
      }
    } else {
      console.log('[UNIFIED-CHAT] Anonymous user - using free providers');
      selectedProvider = 'auto';
    }

    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // Enrich context with current information and real-time data
    console.log('[CONTEXT] Analyzing query for context enrichment...')
    const contextAnalysis = enrichContext(userMessage)

    // If query needs real-time information, attempt web search
    let searchContext: string | null = null
    if (contextAnalysis.needsRealTime && contextAnalysis.realTimeCategory) {
      console.log(`[CONTEXT] Query needs real-time info: ${contextAnalysis.realTimeCategory}`)
      searchContext = await performContextualSearch(
        userMessage,
        contextAnalysis.realTimeCategory,
        0.80 // Confidence threshold (lowered for broader matching)
      )
      if (searchContext) {
        console.log('[CONTEXT] ✅ Web search results added to context')
      }
    }

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

    // Update the last user message with enriched query
    enrichedMessages[enrichedMessages.length - 1] = {
      ...enrichedMessages[enrichedMessages.length - 1],
      content: contextAnalysis.enrichedQuery
    }

    console.log('[CONTEXT] Messages enriched:', {
      hasSystemContext: true,
      hasSearchResults: !!searchContext,
      needsRealTime: contextAnalysis.needsRealTime,
      category: contextAnalysis.realTimeCategory
    })

    const startTime = Date.now();

    // Determine if using free providers or user's API key
    const usingFreeProviders = !userApiKey || selectedProvider === 'auto';

    // Use consistent cache parameters
    const cacheModel = usingFreeProviders ? 'free-model' : `${selectedProvider}-model`;
    const cacheProvider = usingFreeProviders ? 'mixed' : selectedProvider;

    // Track prediction accuracy
    const predictiveCacheInstance = await getPredictiveCache();
    await predictiveCacheInstance.trackPredictionAccuracy(userMessage);

    // Check cache first using tier-based system (with version to avoid stale entries)
    console.log(`[CACHE] Checking for cached response (version: ${CACHE_VERSION})...`);
    const versionedCacheModel = `${cacheModel}:${CACHE_VERSION}`;
    const cached = await findCachedResponse(userMessage, versionedCacheModel, cacheProvider);

    if (cached) {
      console.log('[CACHE] ✅ Using cached response');

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

      // Log if artifacts were removed
      if (hasExecutionArtifacts(cached.response)) {
        console.log('[SANITIZE] Cleaned cached response artifacts')
      }

      // Analyze cached response quality
      const userQuery = messages[messages.length - 1]?.content || ''
      const cachedQualityScore = getQualityScore(sanitizedCachedResponse, userQuery)
      const cachedMetrics = analyzeResponse(sanitizedCachedResponse)

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

    // No cache hit, call appropriate provider
    let result: { response: string; provider: string };
    let finalModel: string;

    if (usingFreeProviders) {
      // Use free providers (auto-rotates between Groq, OpenRouter, HuggingFace)
      console.log('[CHAT] No cache hit, calling free providers...');
      result = await callFreeProvider(enrichedMessages);
      finalModel = 'free-model';  // Don't expose which specific free model was used
    } else {
      // Use premium provider with user's API key
      console.log(`[CHAT] No cache hit, calling ${selectedProvider} with user API key and model ${selectedModel}...`);
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

    // Log if artifacts were removed
    if (hasExecutionArtifacts(result.response)) {
      console.log('[SANITIZE] Cleaned response artifacts from', result.provider)
    }

    // Store in cache with version (original response - will be sanitized on retrieval)
    await storeInCache(
      userMessage,
      result.response,
      versionedCacheModel, // Use versioned model to separate old/new cache entries
      cacheProvider,
      userId,
      responseTime
    );

    // Save to unified chat history system (use original messages + sanitized response)
    await saveChatHistory(
      userId,
      messages, // Original messages without system context
      sanitizedResponse, // Use sanitized response
      result.provider,
      finalModel,
      responseTime,
      'web' // Can be enhanced to detect platform
    );

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

    return NextResponse.json({
      response: sanitizedResponse,
      provider: result.provider,
      model: finalModel,
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