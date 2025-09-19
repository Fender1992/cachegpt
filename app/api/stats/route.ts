import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function GET(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({
        error: 'Database configuration missing'
      }, { status: 503 });
    }

    // Get overall cache statistics
    const { data: stats, error: statsError } = await supabase
      .from('cache_stats')
      .select('*')
      .single();

    if (statsError && statsError.code !== 'PGRST116') { // Ignore "no rows" error
      throw statsError;
    }

    // Get recent cache hits
    const { data: recentHits, error: hitsError } = await supabase
      .from('cached_responses')
      .select('id, query, model, created_at, access_count')
      .order('last_accessed', { ascending: false })
      .limit(10);

    if (hitsError) {
      console.error('Failed to fetch recent hits:', hitsError);
    }

    // Get model distribution
    const { data: modelStats, error: modelError } = await supabase
      .from('cached_responses')
      .select('model')
      .then(result => {
        if (!result.data) return { data: null, error: result.error };

        const distribution = result.data.reduce((acc: any, item: any) => {
          acc[item.model] = (acc[item.model] || 0) + 1;
          return acc;
        }, {});

        return { data: distribution, error: null };
      });

    // Calculate cost savings
    const totalRequests = stats?.total_accesses || 0;
    const cacheHits = (stats?.total_accesses || 0) - (stats?.total_responses || 0);
    const hitRate = totalRequests > 0 ? (cacheHits / totalRequests * 100).toFixed(2) : 0;

    // Estimate cost savings (rough calculation)
    const avgCostPerRequest = 0.002; // Average $0.002 per request
    const totalSaved = (cacheHits * avgCostPerRequest).toFixed(2);

    return NextResponse.json({
      totalRequests,
      cacheHits,
      hitRate: parseFloat(hitRate as string),
      totalSaved: parseFloat(totalSaved),
      uniqueQueries: stats?.total_responses || 0,
      modelDistribution: modelStats || {},
      recentHits: recentHits || [],
      oldestEntry: stats?.oldest_cache_entry,
      newestEntry: stats?.latest_cache_entry,
    });

  } catch (error: any) {
    console.error('Stats API error:', error);

    // Return mock data if database is not set up
    return NextResponse.json({
      totalRequests: 0,
      cacheHits: 0,
      hitRate: 0,
      totalSaved: 0,
      uniqueQueries: 0,
      modelDistribution: {},
      recentHits: [],
      message: 'Cache statistics will be available once the database is configured'
    });
  }
}