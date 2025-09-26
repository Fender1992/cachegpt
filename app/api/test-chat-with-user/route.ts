/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to test chat logic, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * Test endpoint for chat with specific user ID - bypasses auth for testing
 * After making changes:
 * - Update STATUS file with test results
 * - Document any user ID tracking changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
 * Store response in cache database with specific user ID
 */
async function storeInCache(
  query: string,
  response: string,
  userId: string,
  responseTimeMs: number
): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const embedding = generateSimpleEmbedding(query);

    console.log(`[TEST-CACHE-STORE] Storing: user=${userId}, query="${query.substring(0, 50)}..."`);

    const insertData = {
      query,
      response,
      model: 'free-model',
      provider: 'mixed',
      embedding,
      user_id: userId,
      access_count: 1,
      popularity_score: 50.0,
      ranking_version: 1,
      tier: 'cool',
      cost_saved: 0.01,
      is_archived: false,
      ranking_metadata: {
        test_endpoint: true,
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
      console.error('[TEST-CACHE-STORE] Database error:', error);
    } else {
      console.log(`[TEST-CACHE-STORE] ✅ Stored response with ID: ${data?.[0]?.id} for user: ${userId}`);
    }

  } catch (error) {
    console.error('[TEST-CACHE-STORE] Error:', error);
  }
}

/**
 * Call free provider APIs
 */
async function callFreeProvider(messages: any[]): Promise<{ response: string; provider: string }> {
  const providers = [
    {
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.1-8b-instant'
    }
  ];

  for (const provider of providers) {
    if (!provider.apiKey) continue;

    try {
      console.log(`[TEST-FREE-PROVIDER] Trying ${provider.name}...`);

      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`[TEST-FREE-PROVIDER] ${provider.name} failed: ${error}`);
        continue;
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || 'No response';

      console.log(`[TEST-FREE-PROVIDER] ✅ Success with ${provider.name}`);
      return { response: responseText, provider: provider.name };

    } catch (error: any) {
      console.error(`[TEST-FREE-PROVIDER] ${provider.name} error:`, error.message);
      continue;
    }
  }

  throw new Error('All free providers failed');
}

/**
 * Test chat endpoint with specific user ID
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required for this test endpoint' }, { status: 400 });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    console.log(`[TEST-CHAT] Request from user: ${userId}`);

    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage) {
      return NextResponse.json({ error: 'No message content provided' }, { status: 400 });
    }

    const startTime = Date.now();

    // Call free providers
    console.log('[TEST-CHAT] Calling free providers...');
    const result = await callFreeProvider(messages);
    const responseTime = Date.now() - startTime;

    // Store in cache with specific user ID
    await storeInCache(
      userMessage,
      result.response,
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
      endpoint: '/api/test-chat-with-user',
      method: 'POST',
      model: 'free-model',
      metadata: {
        provider: result.provider,
        cached: false,
        test_endpoint: true,
        response_time: responseTime,
        response_length: result.response.length
      }
    });

    return NextResponse.json({
      response: result.response,
      metadata: {
        userId: userId,
        cached: false,
        provider: result.provider,
        responseTime,
        testEndpoint: true
      }
    });

  } catch (error: any) {
    console.error('[TEST-CHAT] Error:', error);
    return NextResponse.json({
      error: error.message || 'Test chat request failed'
    }, { status: 500 });
  }
}