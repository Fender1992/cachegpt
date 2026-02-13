/**
 * Jira Projects API
 * GET: List user's Jira projects
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidJiraToken } from '@/lib/jira/jira-token';

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
      .select('id, access_token, refresh_token, token_expires_at, provider_data')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'jira')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Jira not connected' }, { status: 404 });
    }

    const token = await getValidJiraToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    const cloudId = integration.provider_data?.cloud_id;
    if (!cloudId) {
      return NextResponse.json({ error: 'No Jira cloud ID found' }, { status: 400 });
    }

    const res = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search?maxResults=50&orderBy=name`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      console.error('[Jira Projects] Failed:', res.status);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      projects: (data.values || []).map((p: any) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        avatarUrl: p.avatarUrls?.['48x48'] || p.avatarUrls?.['32x32'] || '',
        projectTypeKey: p.projectTypeKey,
        style: p.style,
      })),
    });
  } catch (error) {
    console.error('[Jira Projects] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Jira projects' },
      { status: 500 }
    );
  }
}
