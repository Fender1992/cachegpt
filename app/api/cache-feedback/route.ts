import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, getUserId, isAuthError } from '@/lib/unified-auth-resolver';

/**
 * POST /api/cache-feedback
 * Submit feedback on a cached response
 *
 * Body:
 * {
 *   cacheId: string,
 *   feedback: 'helpful' | 'outdated' | 'incorrect'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await resolveAuthentication(request);

    // Check if authentication failed
    if (isAuthError(session)) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = getUserId(session);

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { cacheId, feedback } = body;

    if (!cacheId || !feedback) {
      return NextResponse.json(
        { error: 'Missing cacheId or feedback' },
        { status: 400 }
      );
    }

    if (!['helpful', 'outdated', 'incorrect'].includes(feedback)) {
      return NextResponse.json(
        { error: 'Invalid feedback value. Must be: helpful, outdated, or incorrect' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Get current feedback data
    const { data: current, error: fetchError } = await supabase
      .from('cached_responses')
      .select('user_feedback, feedback_count, quality_score')
      .eq('id', cacheId)
      .single();

    if (fetchError || !current) {
      console.error('[CACHE-FEEDBACK] Error fetching cache entry:', fetchError);
      return NextResponse.json(
        { error: 'Cache entry not found' },
        { status: 404 }
      );
    }

    // Calculate new quality score
    const feedbackCount = (current.feedback_count || 0) + 1;
    const currentScore = current.quality_score || 50.0;

    // Score adjustments
    const scoreDeltas = {
      helpful: +10,
      outdated: -15,
      incorrect: -25
    };

    const delta = scoreDeltas[feedback as keyof typeof scoreDeltas];

    // Weighted average: new feedback has more impact on fewer feedbacks
    const weight = Math.min(1.0, 5.0 / feedbackCount); // First 5 feedbacks have full impact
    const newScore = Math.max(0, Math.min(100, currentScore + (delta * weight)));

    console.log(`[CACHE-FEEDBACK] Cache ${cacheId}: ${feedback} (${feedbackCount} total) - Score: ${currentScore.toFixed(1)} → ${newScore.toFixed(1)}`);

    // Update cache entry
    const { error: updateError } = await supabase
      .from('cached_responses')
      .update({
        user_feedback: feedback, // Store most recent feedback
        feedback_count: feedbackCount,
        quality_score: newScore
      })
      .eq('id', cacheId);

    if (updateError) {
      console.error('[CACHE-FEEDBACK] Error updating cache entry:', updateError);
      return NextResponse.json(
        { error: 'Failed to update cache entry' },
        { status: 500 }
      );
    }

    // Store individual feedback record for analytics
    await supabase
      .from('cache_feedback_log')
      .insert({
        cache_id: cacheId,
        user_id: userId,
        feedback: feedback,
        created_at: new Date().toISOString()
      });

    return NextResponse.json({
      success: true,
      newScore: Math.round(newScore),
      feedbackCount: feedbackCount
    });

  } catch (error: any) {
    console.error('[CACHE-FEEDBACK] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
