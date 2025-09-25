import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with null checks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Cache pre-warming endpoint - ADMIN ONLY
 * Call this periodically to pre-cache popular queries
 * Requires CRON_SECRET or admin authentication
 */
export async function POST(req: NextRequest) {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      return NextResponse.json({
        error: 'Database configuration missing'
      }, { status: 503 });
    }

    // Require admin authentication
    const cronSecret = req.headers.get('authorization') || req.headers.get('x-cron-secret');
    const validCronSecret = process.env.CRON_SECRET;

    if (!cronSecret || !validCronSecret || cronSecret.replace('Bearer ', '') !== validCronSecret) {
      return NextResponse.json({
        error: 'Unauthorized - Admin access required'
      }, { status: 401 });
    }

    // Get queries that need warming
    const { data: queriesToWarm, error: fetchError } = await supabase
      .rpc('get_queries_to_warm', { limit_count: 10 });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!queriesToWarm || queriesToWarm.length === 0) {
      return NextResponse.json({
        message: 'No queries need warming',
        warmed: 0
      });
    }

    const warmedQueries = [];

    // Process each query
    for (const item of queriesToWarm) {
      try {
        // Call your LLM provider to get response
        const response = await fetchLLMResponse(item.query);

        if (response) {
          // Generate embedding
          const embedding = await generateEmbedding(item.query);

          // Cache the response
          if (supabase) {
            await supabase
              .from('cached_responses')
              .insert({
                query: item.query,
                response: response,
                embedding: embedding,
                model: 'gpt-3.5-turbo', // Or your default model
                created_at: new Date().toISOString(),
                access_count: item.request_count // Start with existing request count
              });

            // Mark as cached in popular_queries
            await supabase
              .from('popular_queries')
              .update({ is_cached: true })
              .eq('query', item.query);
          }

          warmedQueries.push(item.query);
        }
      } catch (error) {
        console.error(`Failed to warm query "${item.query}":`, error);
      }
    }

    return NextResponse.json({
      message: 'Cache warming completed',
      warmed: warmedQueries.length,
      queries: warmedQueries
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function fetchLLMResponse(query: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: query }],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;

  } catch (error) {
    console.error('LLM fetch error:', error);
    return null;
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.slice(0, 8000)
      })
    });

    if (!response.ok) {
      // Fallback to simple embedding
      return generateSimpleEmbedding(text);
    }

    const data = await response.json();
    // Ada-002 returns 1536 dimensions, but our DB uses 384
    // Take first 384 dimensions or pad if needed
    const fullEmbedding = data.data[0].embedding;
    return fullEmbedding.slice(0, 384);

  } catch (error) {
    return generateSimpleEmbedding(text);
  }
}

function generateSimpleEmbedding(text: string): number[] {
  const embedding = new Array(384).fill(0);
  for (let i = 0; i < text.length; i++) {
    embedding[i % 384] = (text.charCodeAt(i) / 255) - 0.5;
  }
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}

// GET endpoint to check warming status - ADMIN ONLY
export async function GET(req: NextRequest) {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      return NextResponse.json({
        error: 'Database configuration missing'
      }, { status: 503 });
    }

    // Require admin authentication
    const cronSecret = req.headers.get('authorization') || req.headers.get('x-cron-secret');
    const validCronSecret = process.env.CRON_SECRET;

    if (!cronSecret || !validCronSecret || cronSecret.replace('Bearer ', '') !== validCronSecret) {
      return NextResponse.json({
        error: 'Unauthorized - Admin access required'
      }, { status: 401 });
    }

    const { data, error } = await supabase
      .rpc('get_queries_to_warm', { limit_count: 100 });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      queries_needing_warming: data?.length || 0,
      top_queries: data?.slice(0, 10) || []
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}