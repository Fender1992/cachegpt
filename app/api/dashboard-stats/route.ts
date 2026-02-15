import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createClient as createBrowserClient } from '@supabase/supabase-js';

export const runtime = 'edge';

/**
 * GET /api/dashboard-stats
 * Returns casual user dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string | null = null;

    // Try Bearer token first (used by client-side fetches)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabaseClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    // Fall back to cookie-based auth
    if (!userId) {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!authError && user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service-level client for data queries
    const supabase = await createClient();

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
