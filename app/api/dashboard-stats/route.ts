import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

/**
 * GET /api/dashboard-stats
 * Returns casual user dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get total chats (conversations)
    const { count: totalChats, error: chatsError } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (chatsError) {
      console.error('[DASHBOARD] Error fetching chats:', chatsError);
    }

    // Get cache hit stats from conversations
    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('cache_hits, total_messages')
      .eq('user_id', userId);

    if (conversationsError) {
      console.error('[DASHBOARD] Error fetching conversation stats:', conversationsError);
    }

    // Calculate cache hit percentage
    let cacheHitPercentage = 0;
    if (conversations && conversations.length > 0) {
      const totalCacheHits = conversations.reduce((sum, conv) => sum + (conv.cache_hits || 0), 0);
      const totalMessages = conversations.reduce((sum, conv) => sum + (conv.total_messages || 0), 0);
      if (totalMessages > 0) {
        cacheHitPercentage = Math.round((totalCacheHits / totalMessages) * 100);
      }
    }

    // Get most used model from user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('selected_provider, selected_model')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('[DASHBOARD] Error fetching profile:', profileError);
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

    // Get user achievements
    const { data: achievements, error: achievementsError } = await supabase
      .from('user_achievements')
      .select('achievement_key, unlocked_at')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (achievementsError) {
      console.error('[DASHBOARD] Error fetching achievements:', achievementsError);
    }

    // Return stats
    return NextResponse.json(
      {
        stats: {
          totalChats: totalChats || 0,
          cacheHitPercentage,
          topModel,
        },
        activityByDay,
        badges: achievements || [],
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
