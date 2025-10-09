import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { isFeatureEnabled } from '@/lib/featureFlags';

export const runtime = 'edge';

/**
 * GET /api/modes
 * Returns all active modes/templates and trending modes
 *
 * Response:
 * {
 *   modes: Array<{
 *     id: string;
 *     slug: string;
 *     title: string;
 *     description: string;
 *     icon: string;
 *     system_prompt: string;
 *     example_prompts: string[];
 *   }>,
 *   trending: Array<{
 *     slug: string;
 *     title: string;
 *     description: string;
 *     icon: string;
 *     click_count: number;
 *     last_clicked: string;
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Check feature flag
    const enabled = await isFeatureEnabled('templates_gallery_trending');
    if (!enabled) {
      return NextResponse.json(
        { error: 'Feature not available' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Fetch active modes from database
    const { data: modes, error } = await supabase
      .from('public_modes')
      .select('id, slug, title, description, icon, system_prompt, example_prompts')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[MODES API] Error fetching modes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch modes' },
        { status: 500 }
      );
    }

    // Fetch trending modes from view
    const { data: trending, error: trendingError } = await supabase
      .from('trending_modes')
      .select('slug, title, description, icon, click_count, last_clicked')
      .limit(6);

    if (trendingError) {
      console.error('[MODES API] Error fetching trending:', trendingError);
      // Don't fail if trending fails, just return empty array
    }

    // Return modes with cache headers (5 minutes)
    return NextResponse.json(
      {
        modes: modes || [],
        trending: trending || []
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('[MODES API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
