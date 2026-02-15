import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  resolveAuthentication,
  isAuthError,
  getUserId
} from '@/lib/unified-auth-resolver';

/**
 * GET /api/dashboard-stats
 * Returns user dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await resolveAuthentication(request);

    if (isAuthError(authResult)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = getUserId(authResult);

    // Use service-level client for data queries
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get total chats (conversations)
    const { count: totalChats, error: chatsError } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (chatsError) {
      console.error('[DASHBOARD] Error fetching chats:', chatsError);
    }

    // Get total messages count
    const { count: totalMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (messagesError) {
      console.error('[DASHBOARD] Error fetching messages:', messagesError);
    }

    // Get cache hit stats from usage table (if it exists)
    let cacheHitPercentage = 0;
    let costSaved = 0;
    const { data: usageData, error: usageError } = await supabase
      .from('usage')
      .select('cache_hit, cost_saved')
      .eq('user_id', userId);

    if (!usageError && usageData && usageData.length > 0) {
      const cacheHits = usageData.filter(u => u.cache_hit).length;
      cacheHitPercentage = Math.round((cacheHits / usageData.length) * 100);
      costSaved = usageData.reduce((sum, u) => sum + (u.cost_saved || 0), 0);
    }

    // Get most used model from user profile
    // Try user_id first, fall back to id
    let profile = null;
    const { data: profileByUserId, error: profileError1 } = await supabase
      .from('user_profiles')
      .select('selected_provider, selected_model')
      .eq('user_id', userId)
      .single();

    if (!profileError1 && profileByUserId) {
      profile = profileByUserId;
    } else {
      const { data: profileById } = await supabase
        .from('user_profiles')
        .select('selected_provider, selected_model')
        .eq('id', userId)
        .single();
      profile = profileById;
    }

    const topModel = profile?.selected_model || 'GPT-4';

    // Get recent activity (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: activityData, error: activityError } = await supabase
      .from('conversations')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', fourteenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (activityError) {
      console.error('[DASHBOARD] Error fetching activity:', activityError);
    }

    // Group by day for chart
    const activityByDay: { [key: string]: number } = {};
    if (activityData) {
      activityData.forEach((conv) => {
        const date = new Date(conv.created_at).toISOString().split('T')[0];
        activityByDay[date] = (activityByDay[date] || 0) + 1;
      });
    }

    // Get user achievements (gracefully handle if table doesn't exist)
    let achievements: any[] = [];
    const { data: achievementsData, error: achievementsError } = await supabase
      .from('user_achievements')
      .select('achievement_key, unlocked_at')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (!achievementsError && achievementsData) {
      achievements = achievementsData;
    }

    // Return stats
    return NextResponse.json(
      {
        stats: {
          totalChats: totalChats || 0,
          totalMessages: totalMessages || 0,
          cacheHitPercentage,
          costSaved: parseFloat(costSaved.toFixed(2)),
          topModel,
        },
        activityByDay,
        badges: achievements,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('[DASHBOARD] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
