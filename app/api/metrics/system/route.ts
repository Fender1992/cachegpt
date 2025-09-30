import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { error as logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // This endpoint provides system-wide metrics (no auth required for status page)
    // Get last 24 hours of data
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);

    // Fetch aggregated usage data (all users)
    const { data: usageData, error: usageError } = await supabase
      .from('usage')
      .select('cache_hit, cost_saved, response_time_ms, created_at')
      .gte('created_at', startDate.toISOString());

    if (usageError) {
      logError('Error fetching system metrics', usageError);
      // Return empty metrics if query fails (don't expose error details)
      return NextResponse.json({
        requests24h: 0,
        cacheHitRate: 0,
        avgResponseTime: 0,
        errorRate: 0
      });
    }

    const totalRequests = usageData?.length || 0;
    const cacheHits = usageData?.filter(log => log.cache_hit).length || 0;
    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

    const avgResponseTime = totalRequests > 0
      ? usageData?.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / totalRequests
      : 0;

    // Error rate would need error tracking in usage table
    // For now, estimate based on very high response times
    const errors = usageData?.filter(log => (log.response_time_ms || 0) > 30000).length || 0;
    const errorRate = totalRequests > 0 ? (errors / totalRequests) * 100 : 0;

    return NextResponse.json({
      requests24h: totalRequests,
      cacheHitRate: parseFloat(cacheHitRate.toFixed(2)),
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: parseFloat(errorRate.toFixed(2))
    });
  } catch (error) {
    logError('Error in system metrics endpoint', error);
    // Return empty metrics on error (don't expose internal errors)
    return NextResponse.json({
      requests24h: 0,
      cacheHitRate: 0,
      avgResponseTime: 0,
      errorRate: 0
    });
  }
}