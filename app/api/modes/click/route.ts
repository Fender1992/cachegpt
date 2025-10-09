import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { resolveAuthentication, getUserId, isAuthError } from '@/lib/unified-auth-resolver';
import { isFeatureEnabled } from '@/lib/featureFlags';

/**
 * POST /api/modes/click
 * Records a mode click for trending calculation
 *
 * Body:
 * {
 *   modeSlug: string;
 *   source?: 'gallery' | 'empty_state' | 'share';
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check feature flag
    const enabled = await isFeatureEnabled('templates_gallery_trending');
    if (!enabled) {
      return NextResponse.json(
        { error: 'Feature not available' },
        { status: 403 }
      );
    }

    const { modeSlug, source } = await request.json();

    // Validate input
    if (!modeSlug || typeof modeSlug !== 'string') {
      return NextResponse.json(
        { error: 'Invalid mode slug' },
        { status: 400 }
      );
    }

    // Validate mode slug format
    if (!/^[a-z0-9-]{2,50}$/.test(modeSlug)) {
      return NextResponse.json(
        { error: 'Invalid mode slug format' },
        { status: 400 }
      );
    }

    // Validate source if provided
    const validSources = ['gallery', 'empty_state', 'share'];
    if (source && !validSources.includes(source)) {
      return NextResponse.json(
        { error: 'Invalid source' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get user ID if authenticated
    const session = await resolveAuthentication(request);
    const userId = !isAuthError(session) ? getUserId(session) : null;

    // Generate session ID from IP + user agent
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const sessionId = Buffer.from(`${ip}:${userAgent}`).toString('base64').substring(0, 32);

    // Record click
    const { error: insertError } = await supabase
      .from('mode_clicks')
      .insert({
        mode_slug: modeSlug,
        user_id: userId,
        session_id: sessionId,
        source: source || null,
      });

    if (insertError) {
      console.error('[MODES-CLICK] Error recording click:', insertError);
      return NextResponse.json(
        { error: 'Failed to record click' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[MODES-CLICK] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
