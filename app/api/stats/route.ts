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

    // Get stats from usage table (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: usageData, error: usageError } = await supabase
      .from('usage')
      .select('cache_hit, cost, provider, model')
      .gte('created_at', thirtyDaysAgo);

    if (usageError) {
      throw usageError;
    }

    // Calculate statistics
    const totalRequests = usageData?.length || 0;
    const cacheHits = usageData?.filter(u => u.cache_hit).length || 0;
    const hitRate = totalRequests > 0 ? ((cacheHits / totalRequests) * 100).toFixed(2) : '0';

    // Calculate cost savings
    const totalCost = usageData?.reduce((sum, u) => sum + (u.cost || 0), 0) || 0;
    const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0.002;
    const totalSaved = (cacheHits * avgCostPerRequest).toFixed(2);

    // Model distribution
    const modelDistribution = (usageData || []).reduce((acc: any, item: any) => {
      const model = item.model || 'unknown';
      acc[model] = (acc[model] || 0) + 1;
      return acc;
    }, {});

    // Provider distribution
    const providerDistribution = (usageData || []).reduce((acc: any, item: any) => {
      const provider = item.provider || 'unknown';
      acc[provider] = (acc[provider] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      totalRequests,
      cacheHits,
      hitRate: parseFloat(hitRate),
      totalSaved: parseFloat(totalSaved),
      totalCost: parseFloat(totalCost.toFixed(2)),
      modelDistribution,
      providerDistribution,
      period: '30 days',
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