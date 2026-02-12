/**
 * GitHub Integration API
 * GET  - Integration status (connected?, syncing?, doc count, last sync)
 * DELETE - Disconnect (remove integration + cascade-delete documents)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, isAuthError, getUserId } from '@/lib/unified-auth-resolver';
import type { UnifiedSession } from '@/lib/unified-auth-resolver';
import type { IntegrationStatus } from '@/lib/integrations/types';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const authResult = await resolveAuthentication(request);
  if (isAuthError(authResult)) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const session = authResult as UnifiedSession;
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Get integration record
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .single();

  if (!integration) {
    const status: IntegrationStatus = {
      connected: false,
      syncing: false,
      documentCount: 0,
      lastSyncedAt: null,
      providerUserId: null,
      providerData: {},
    };
    return NextResponse.json(status);
  }

  // Get document count
  const { count } = await supabase
    .from('integration_documents')
    .select('id', { count: 'exact', head: true })
    .eq('integration_id', integration.id);

  const status: IntegrationStatus = {
    connected: integration.status !== 'disconnected',
    syncing: integration.status === 'syncing',
    documentCount: count || 0,
    lastSyncedAt: integration.last_synced_at,
    providerUserId: integration.provider_user_id,
    providerData: integration.provider_data || {},
  };

  return NextResponse.json(status);
}

export async function DELETE(request: NextRequest) {
  const authResult = await resolveAuthentication(request);
  if (isAuthError(authResult)) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const session = authResult as UnifiedSession;
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Delete integration (documents cascade-delete via FK)
  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'github');

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
