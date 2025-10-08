import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'edge';

/**
 * GET /api/modes
 * Returns all active modes/templates
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
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
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

    // Return modes with cache headers (5 minutes)
    return NextResponse.json(
      { modes: modes || [] },
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
