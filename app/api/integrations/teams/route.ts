/**
 * Teams Integration Status API
 * GET: Retrieve Teams integration status
 * DELETE: Disconnect Teams integration
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
      .eq('provider', 'teams')
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        organizationName: null,
        userName: null,
        teamCount: 0,
        lastSyncedAt: null,
        providerData: {},
      });
    }

    return NextResponse.json({
      connected: integration.status !== 'disconnected',
      organizationName: integration.provider_data?.organization_name || null,
      userName: integration.provider_data?.user_name || null,
      teamCount: integration.provider_data?.team_count || 0,
      lastSyncedAt: integration.last_synced_at,
      providerData: integration.provider_data || {},
    });
  } catch (error) {
    console.error('[Teams Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Teams status' },
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
      .eq('provider', 'teams')
      .single();

    if (!integration) {
      return NextResponse.json({ message: 'No Teams integration found' });
    }

    await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    return NextResponse.json({ message: 'Teams integration disconnected' });
  } catch (error) {
    console.error('[Teams Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Teams' },
      { status: 500 }
    );
  }
}
