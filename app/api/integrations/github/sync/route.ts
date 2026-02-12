/**
 * GitHub Sync API
 * POST - Trigger manual re-sync of GitHub repos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthentication, isAuthError, getUserId } from '@/lib/unified-auth-resolver';
import type { UnifiedSession } from '@/lib/unified-auth-resolver';
import { syncGitHubRepos } from '@/lib/integrations/github-adapter';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function POST(request: NextRequest) {
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

  // Get integration
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, access_token, status')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .single();

  if (!integration) {
    return NextResponse.json({ error: 'GitHub not connected' }, { status: 404 });
  }

  if (integration.status === 'syncing') {
    return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 });
  }

  if (!integration.access_token) {
    return NextResponse.json({ error: 'No access token' }, { status: 400 });
  }

  // Fire-and-forget: start sync in background to avoid serverless timeout
  syncGitHubRepos(userId, integration.id, integration.access_token).catch((err) => {
    console.error('[GitHub Sync] Background sync failed:', err);
  });

  return NextResponse.json({ success: true, message: 'Sync started' });
}
