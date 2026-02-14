/**
 * Teams Channels API
 * GET: Fetch user's joined teams and their channels
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { createClient } from '@supabase/supabase-js';
import { getValidTeamsToken } from '@/lib/teams/teams-token';

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
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', authResult.user.id)
      .eq('provider', 'teams')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Teams not connected' }, { status: 404 });
    }

    const token = await getValidTeamsToken(
      integration.id,
      integration.access_token,
      integration.refresh_token,
      integration.token_expires_at
    );

    if (!token) {
      return NextResponse.json({ error: 'Failed to get valid token' }, { status: 401 });
    }

    // Fetch joined teams
    const teamsRes = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!teamsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch teams' }, { status: teamsRes.status });
    }

    const teamsData = await teamsRes.json();
    const teams = teamsData.value || [];

    // Fetch channels for each team
    const channels: any[] = [];

    for (const team of teams) {
      try {
        const channelsRes = await fetch(
          `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (channelsRes.ok) {
          const channelsData = await channelsRes.json();
          for (const ch of channelsData.value || []) {
            channels.push({
              id: ch.id,
              name: ch.displayName,
              description: ch.description || '',
              teamId: team.id,
              teamName: team.displayName,
              membershipType: ch.membershipType || 'standard',
            });
          }
        }
      } catch {
        // Skip teams where channel fetch fails
      }
    }

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('[Teams Channels] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Teams channels' },
      { status: 500 }
    );
  }
}
