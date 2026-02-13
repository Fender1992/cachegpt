/**
 * Google Calendar Integration Status API
 * GET: Retrieve Google Calendar integration status
 * DELETE: Disconnect Google Calendar integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'google_calendar')
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        email: null,
        calendarCount: 0,
        lastSyncedAt: null,
        providerData: {},
      });
    }

    return NextResponse.json({
      connected: integration.status !== 'disconnected',
      email: integration.provider_user_id,
      calendarCount: integration.provider_data?.calendar_count || 0,
      lastSyncedAt: integration.last_synced_at,
      providerData: integration.provider_data || {},
    });
  } catch (error) {
    console.error('[Google Calendar Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Calendar status' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'google_calendar')
      .single();

    if (!integration) {
      return NextResponse.json({ message: 'No Google Calendar integration found' });
    }

    await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    return NextResponse.json({ message: 'Google Calendar integration disconnected' });
  } catch (error) {
    console.error('[Google Calendar Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google Calendar' },
      { status: 500 }
    );
  }
}
