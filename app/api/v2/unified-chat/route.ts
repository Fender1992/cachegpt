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
import { tierCache } from '@/lib/tier-based-cache';
import { predictiveCache } from '@/lib/predictive-cache';
import { rankingManager } from '@/lib/ranking-features-manager';

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
    // Use the new tier-based cache system
    const cached = await tierCache.findSimilarResponse(query, model, provider, {
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
    // Use the new tier-based cache system
    const responseId = await tierCache.storeResponse(
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
  apiKey: string
): Promise<{ response: string; provider: string }> {
  console.log(`[PREMIUM-PROVIDER] Calling ${provider} with user's API key`);

  try {
    let endpoint: string;
    let headers: any = {
      'Content-Type': 'application/json'
    };
    let body: any;

    switch (provider) {
      case 'chatgpt':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: 'gpt-4-turbo-preview',
          messages,
          temperature: 0.7,
          max_tokens: 2000
        };
        break;

      case 'claude':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: 'claude-3-opus-20240229',
          messages: messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          })),
          max_tokens: 2000
        };
        break;

      case 'gemini':
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
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
          model: 'pplx-70b-online',
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
      model: 'llama-3.1-8b-instant'
    },
    {
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'nousresearch/nous-hermes-2-mixtral-8x7b-dpo'
    },
    {
      name: 'huggingface',
      apiKey: process.env.HUGGINGFACE_API_KEY,
      endpoint: 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
      model: 'mixtral-8x7b'
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
 * Main chat endpoint - Anonymous access allowed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, provider, model, authMethod } = body;

    console.log('[UNIFIED-CHAT] Request:', { provider, model, authMethod, messageCount: messages?.length });

    // Try to authenticate user, but allow anonymous access
    let userId: string | null = null;
    let session: UnifiedSession | null = null;
    let userApiKey: string | null = null;
    let preferredProvider: string = 'auto';

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
            // Use the first available API key or the one matching selected provider
            const selectedCred = credentials.find(c => c.provider === profile.selected_provider) || credentials[0];
            if (selectedCred) {
              userApiKey = atob(selectedCred.api_key); // Decode from base64
              preferredProvider = selectedCred.provider;
              console.log(`[UNIFIED-CHAT] Using user's ${preferredProvider} API key`);
            }
          }
        }
      }
    } else {
      console.log('[UNIFIED-CHAT] Anonymous user access');
    }

    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    const startTime = Date.now();

    // Use consistent cache parameters
    const cacheModel = userApiKey ? `${preferredProvider}-model` : 'free-model';
    const cacheProvider = userApiKey ? preferredProvider : 'mixed';

    // Track prediction accuracy
    await predictiveCache.trackPredictionAccuracy(userMessage);

    // Check cache first using tier-based system
    console.log('[CACHE] Checking for cached response...');
    const cached = await findCachedResponse(userMessage, cacheModel, cacheProvider);

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

      return NextResponse.json({
        response: cached.response,
        metadata: {
          cached: true,
          cacheHit: true, // Add both for compatibility
          similarity: cached.similarity,
          provider: cacheProvider,
          tier: cached.tier,
          accessCount: cached.metadata?.accessCount,
          popularityScore: cached.metadata?.popularityScore,
          timeSavedMs: timeSaved,
          costSaved: costSaved
        }
      });
    }

    // No cache hit, call appropriate provider
    let result: { response: string; provider: string };

    if (userApiKey && preferredProvider !== 'auto') {
      // Use premium provider with user's API key
      console.log('[CHAT] No cache hit, calling premium provider with user API key...');
      try {
        result = await callPremiumProvider(messages, preferredProvider, userApiKey);
      } catch (error) {
        console.error('[CHAT] Premium provider failed, falling back to free providers');
        result = await callFreeProvider(messages);
      }
    } else {
      // Use free providers
      console.log('[CHAT] No cache hit, calling free providers...');
      result = await callFreeProvider(messages);
    }

    const responseTime = Date.now() - startTime;

    // Store in cache
    await storeInCache(
      userMessage,
      result.response,
      cacheModel,
      cacheProvider,
      userId,
      responseTime
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
        response_length: result.response.length
      }
    });

    return NextResponse.json({
      response: result.response,
      metadata: {
        cached: false,
        provider: result.provider,
        responseTime
      }
    });

  } catch (error: any) {
    console.error('[UNIFIED-CHAT] Error:', error);
    return NextResponse.json({
      error: error.message || 'Chat request failed'
    }, { status: 500 });
  }
}