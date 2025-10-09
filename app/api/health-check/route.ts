import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

/**
 * GET /api/health-check
 * Returns health status of all services (server-side to avoid CORS)
 */
export async function GET(request: NextRequest) {
  const results = await Promise.allSettled([
    checkDatabase(),
    checkStats(),
    // Don't check external APIs - they're not our services
  ]);

  const [dbCheck, statsCheck] = results;

  return NextResponse.json({
    database: dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'outage', latency: 0 },
    cache: statsCheck.status === 'fulfilled' ? statsCheck.value : { status: 'outage', latency: 0 },
    timestamp: new Date().toISOString(),
  });
}

async function checkDatabase() {
  const startTime = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('user_profiles').select('id').limit(1);
    const latency = Date.now() - startTime;

    return {
      status: error ? 'degraded' : 'operational',
      latency,
    };
  } catch (error) {
    return {
      status: 'outage',
      latency: Date.now() - startTime,
    };
  }
}

async function checkStats() {
  const startTime = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('usage').select('id').limit(1);
    const latency = Date.now() - startTime;

    return {
      status: error ? 'degraded' : 'operational',
      latency,
    };
  } catch (error) {
    return {
      status: 'outage',
      latency: Date.now() - startTime,
    };
  }
}
