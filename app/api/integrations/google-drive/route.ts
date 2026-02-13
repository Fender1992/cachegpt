/**
 * Google Drive Integration Status API
 * GET: Retrieve Google Drive integration status
 * DELETE: Disconnect Google Drive integration
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
      .eq('provider', 'google_drive')
      .single();

    if (!integration) {
      return NextResponse.json({
        connected: false,
        email: null,
        fileCount: 0,
        lastSyncedAt: null,
        providerData: {},
      });
    }

    return NextResponse.json({
      connected: integration.status !== 'disconnected',
      email: integration.provider_user_id,
      fileCount: integration.provider_data?.file_count || 0,
      lastSyncedAt: integration.last_synced_at,
      providerData: integration.provider_data || {},
    });
  } catch (error) {
    console.error('[Google Drive Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Drive status' },
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
      .eq('provider', 'google_drive')
      .single();

    if (!integration) {
      return NextResponse.json({ message: 'No Google Drive integration found' });
    }

    await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integration.id);

    return NextResponse.json({ message: 'Google Drive integration disconnected' });
  } catch (error) {
    console.error('[Google Drive Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google Drive' },
      { status: 500 }
    );
  }
}
