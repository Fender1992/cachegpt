import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import { error as logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = await createClient();

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get time range from query params (default: last 30 days)
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch usage data for the user
    const { data: usageData, error: usageError } = await supabase
      .from('usage')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (usageError) {
      logError('Error fetching usage data', usageError);
      return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
    }

    // Calculate metrics
    const totalRequests = usageData?.length || 0;
    const cacheHits = usageData?.filter(log => log.cache_hit).length || 0;
    const cacheMisses = totalRequests - cacheHits;
    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

    // Calculate cost saved (sum of cost_saved column)
    const costSaved = usageData?.reduce((sum, log) => sum + (log.cost_saved || 0), 0) || 0;

    // Calculate average response time
    const avgResponseTime = totalRequests > 0
      ? usageData?.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / totalRequests
      : 0;

    // Group by provider
    const providerBreakdown = usageData?.reduce((acc: any, log) => {
      const provider = log.provider || 'unknown';
      if (!acc[provider]) {
        acc[provider] = { requests: 0, cacheHits: 0, costSaved: 0 };
      }
      acc[provider].requests++;
      if (log.cache_hit) acc[provider].cacheHits++;
      acc[provider].costSaved += log.cost_saved || 0;
      return acc;
    }, {}) || {};

    // Group by day for chart data
    const dailyData = usageData?.reduce((acc: any, log) => {
      const date = new Date(log.created_at).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { requests: 0, cached: 0, date };
      }
      acc[date].requests++;
      if (log.cache_hit) acc[date].cached++;
      return acc;
    }, {}) || {};

    const chartData = Object.values(dailyData).slice(0, 30).reverse();

    // Get recent activity (last 10 requests)
    const recentActivity = usageData?.slice(0, 10).map(log => ({
      id: log.id,
      provider: log.provider || 'unknown',
      model: log.model || 'unknown',
      cached: log.cache_hit || false,
      costSaved: log.cost_saved || 0,
      responseTime: log.response_time_ms || 0,
      timestamp: log.created_at
    })) || [];

    return NextResponse.json({
      summary: {
        totalRequests,
        cacheHits,
        cacheMisses,
        cacheHitRate: parseFloat(cacheHitRate.toFixed(2)),
        costSaved: parseFloat(costSaved.toFixed(4)),
        avgResponseTime: Math.round(avgResponseTime)
      },
      providerBreakdown,
      chartData,
      recentActivity,
      timeRange: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    });
  } catch (error) {
    logError('Error in usage metrics endpoint', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}