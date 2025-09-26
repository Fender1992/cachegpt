/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to test cache logic, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * Test endpoint for cache functionality - bypasses auth for testing
 * After making changes:
 * - Update STATUS file with test results
 * - Document any cache performance changes
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
 * Test cache storage directly to database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, response, action } = body;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    if (action === 'store') {
      console.log('[TEST-CACHE-DB] Storing test response...');

      const embedding = generateSimpleEmbedding(query);
      const queryHash = require('crypto').createHash('sha256').update(query + 'free-model' + 'mixed').digest('hex');

      const insertData = {
        query,
        // query_hash is auto-generated, don't include it
        response: response || `Test response for: ${query}`,
        model: 'free-model',
        provider: 'mixed',
        embedding,
        user_id: 'test-user-id',
        access_count: 1,
        popularity_score: 50.0,
        ranking_version: 1,
        tier: 'cool',
        cost_saved: 0.01,
        is_archived: false,
        ranking_metadata: {
          test: true,
          created_by: 'test-endpoint'
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
        console.error('[TEST-CACHE-DB] Insert error:', error);
        return NextResponse.json({
          success: false,
          error: error.message,
          details: error
        }, { status: 500 });
      }

      console.log('[TEST-CACHE-DB] ✅ Stored with ID:', data?.[0]?.id);
      return NextResponse.json({
        success: true,
        message: 'Cache entry stored successfully',
        id: data?.[0]?.id,
        query,
        model: 'free-model',
        provider: 'mixed'
      });

    } else if (action === 'search') {
      console.log('[TEST-CACHE-DB] Searching for cached response...');

      const { data: candidates, error } = await supabase
        .from('cached_responses')
        .select('*')
        .eq('model', 'free-model')
        .eq('provider', 'mixed')
        .eq('is_archived', false)
        .order('popularity_score', { ascending: false })
        .limit(10);

      if (error) {
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        found: candidates?.length || 0,
        candidates: candidates?.map(c => ({
          id: c.id,
          query: c.query.substring(0, 100) + '...',
          created_at: c.created_at,
          access_count: c.access_count
        }))
      });

    } else if (action === 'recent') {
      console.log('[TEST-CACHE-DB] Getting recent entries...');

      const { data: recent, error } = await supabase
        .from('cached_responses')
        .select('id, query, provider, model, created_at, access_count')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        recent: recent?.map(r => ({
          id: r.id,
          query: r.query.substring(0, 100) + '...',
          provider: r.provider,
          model: r.model,
          created_at: r.created_at,
          access_count: r.access_count
        }))
      });

    } else {
      return NextResponse.json({
        error: 'Invalid action. Use "store", "search", or "recent"'
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[TEST-CACHE-DB] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      stack: error.stack
    }, { status: 500 });
  }
}