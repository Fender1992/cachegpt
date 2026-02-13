/**
 * Jira Integration Status API
 * GET: Retrieve Jira integration status
 * DELETE: Disconnect Jira integration
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
      .eq('provider', 'jira')
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        email: null,
        siteName: null,
        cloudId: null,
        lastSyncedAt: null,
        providerData: {},
      });
    }

    return NextResponse.json({
      connected: integration.status !== 'disconnected',
      email: integration.provider_user_id,
      siteName: integration.provider_data?.site_name || null,
      cloudId: integration.provider_data?.cloud_id || null,
      lastSyncedAt: integration.last_synced_at,
      providerData: integration.provider_data || {},
    });
  } catch (error) {
    console.error('[Jira Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Jira status' },
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
      .eq('provider', 'jira')
      .single();

    if (!integration) {
      return NextResponse.json({ message: 'No Jira integration found' });
    }

    await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    return NextResponse.json({ message: 'Jira integration disconnected' });
  } catch (error) {
    console.error('[Jira Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Jira' },
      { status: 500 }
    );
  }
}
