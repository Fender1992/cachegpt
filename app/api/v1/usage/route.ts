import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Cost tracking for different models (per 1K tokens)
const MODEL_COSTS = {
  'gpt-3.5-turbo': 0.002,
  'gpt-4': 0.06,
  'gpt-4-turbo': 0.03,
  'claude-3-opus': 0.06,
  'claude-3-sonnet': 0.03,
  'claude-3-haiku': 0.015,
  'gemini-pro': 0.025,
};

export async function GET(req: NextRequest) {
  try {
    // Get API key from header
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('key', apiKey)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const userId = keyData.user_id;

    // Get current usage stats
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get usage data
    const { data: usage, error: usageError } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startOfDay.toISOString());

    if (usageError) {
      console.error('Usage tracking error:', usageError);
    }

    // Calculate statistics
    const dailyRequests = usage?.length || 0;
    const dailyCacheHits = usage?.filter(u => u.cache_hit).length || 0;
    const dailyTokensUsed = usage?.reduce((sum, u) => sum + (u.tokens_used || 0), 0) || 0;
    const dailyCostIncurred = usage?.reduce((sum, u) => sum + (u.cost || 0), 0) || 0;
    const dailyCostSaved = usage?.reduce((sum, u) => sum + (u.cost_saved || 0), 0) || 0;

    // Get monthly stats
    const { data: monthlyUsage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    const monthlyRequests = monthlyUsage?.length || 0;
    const monthlyCacheHits = monthlyUsage?.filter(u => u.cache_hit).length || 0;
    const monthlyTokensUsed = monthlyUsage?.reduce((sum, u) => sum + (u.tokens_used || 0), 0) || 0;
    const monthlyCostIncurred = monthlyUsage?.reduce((sum, u) => sum + (u.cost || 0), 0) || 0;
    const monthlyCostSaved = monthlyUsage?.reduce((sum, u) => sum + (u.cost_saved || 0), 0) || 0;

    // Get quota limits (simplified for free tier)
    const quotaLimits = {
      daily: {
        requests: 1000,
        tokens: 100000
      },
      monthly: {
        requests: 30000,
        tokens: 3000000
      }
    };

    return NextResponse.json({
      daily: {
        requests: dailyRequests,
        cache_hits: dailyCacheHits,
        cache_hit_rate: dailyRequests > 0 ? (dailyCacheHits / dailyRequests * 100) : 0,
        tokens_used: dailyTokensUsed,
        cost_incurred: dailyCostIncurred.toFixed(4),
        cost_saved: dailyCostSaved.toFixed(4),
        remaining_requests: Math.max(0, quotaLimits.daily.requests - dailyRequests),
        remaining_tokens: Math.max(0, quotaLimits.daily.tokens - dailyTokensUsed)
      },
      monthly: {
        requests: monthlyRequests,
        cache_hits: monthlyCacheHits,
        cache_hit_rate: monthlyRequests > 0 ? (monthlyCacheHits / monthlyRequests * 100) : 0,
        tokens_used: monthlyTokensUsed,
        cost_incurred: monthlyCostIncurred.toFixed(4),
        cost_saved: monthlyCostSaved.toFixed(4),
        remaining_requests: Math.max(0, quotaLimits.monthly.requests - monthlyRequests),
        remaining_tokens: Math.max(0, quotaLimits.monthly.tokens - monthlyTokensUsed)
      },
      limits: quotaLimits,
      reset_times: {
        daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        monthly: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
      }
    });

  } catch (error: any) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 }
    );
  }
}

// Track usage for each request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_id,
      model,
      tokens_used,
      cache_hit,
      response_time_ms,
      endpoint
    } = body;

    // Calculate costs
    const costPerToken = (MODEL_COSTS[model as keyof typeof MODEL_COSTS] || 0.002) / 1000;
    const cost = cache_hit ? 0 : tokens_used * costPerToken;
    const cost_saved = cache_hit ? tokens_used * costPerToken : 0;

    // Insert usage record
    const { error } = await supabase
      .from('usage_tracking')
      .insert({
        user_id,
        model,
        tokens_used,
        cache_hit,
        cost,
        cost_saved,
        response_time_ms,
        endpoint,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Usage tracking insert error:', error);
      return NextResponse.json({ error: 'Failed to track usage' }, { status: 500 });
    }

    // Check if user is approaching limits and send alerts
    const { data: dailyUsage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', user_id)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

    const dailyRequests = dailyUsage?.length || 0;
    const dailyTokens = dailyUsage?.reduce((sum, u) => sum + (u.tokens_used || 0), 0) || 0;

    // Send alerts at 80% and 95% usage
    if (dailyRequests >= 800 && dailyRequests < 850) {
      // Send 80% usage alert (would integrate with email service)
      console.log(`User ${user_id} at 80% daily request limit`);
    } else if (dailyRequests >= 950) {
      // Send 95% usage alert
      console.log(`User ${user_id} at 95% daily request limit`);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Usage tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track usage' },
      { status: 500 }
    );
  }
}