/**
 * Telemetry API endpoint
 * POST /api/telemetry
 *
 * Accepts batched telemetry events from client
 */

import { NextRequest, NextResponse } from 'next/server';
import { processEvents } from '@/lib/telemetry-server';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    // Parse payload
    const payload = await request.json();

    // Validate payload structure
    if (!payload.events || !Array.isArray(payload.events)) {
      return NextResponse.json(
        { error: 'Invalid payload: events array required' },
        { status: 400 }
      );
    }

    // Get user ID if authenticated
    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    } catch (error) {
      // Not authenticated, that's okay for telemetry
    }

    // Process events
    const result = await processEvents(payload, userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process events' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Telemetry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint for debugging (admin only)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    // Check if admin
    if (session?.user?.email !== 'rolandofender@gmail.com') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get recent events
    const { data: events, error } = await supabase
      .from('telemetry_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('[API] Telemetry GET error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
