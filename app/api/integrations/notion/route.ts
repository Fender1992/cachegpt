/**
 * Notion Integration Status API
 * GET: Retrieve Notion integration status
 * DELETE: Disconnect Notion integration
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
      .eq('provider', 'notion')
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        workspaceName: null,
        workspaceIcon: null,
        pageCount: 0,
        lastSyncedAt: null,
        providerData: {},
      });
    }

    return NextResponse.json({
      connected: integration.status !== 'disconnected',
      workspaceName: integration.provider_data?.workspace_name || null,
      workspaceIcon: integration.provider_data?.workspace_icon || null,
      pageCount: integration.provider_data?.page_count || 0,
      lastSyncedAt: integration.last_synced_at,
      providerData: integration.provider_data || {},
    });
  } catch (error) {
    console.error('[Notion Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Notion status' },
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
      .eq('provider', 'notion')
      .single();

    if (!integration) {
      return NextResponse.json({ message: 'No Notion integration found' });
    }

    await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    return NextResponse.json({ message: 'Notion integration disconnected' });
  } catch (error) {
    console.error('[Notion Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Notion' },
      { status: 500 }
    );
  }
}
