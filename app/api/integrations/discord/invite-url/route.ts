import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, isAuthError } from '@/lib/unified-auth-resolver';
import { botProxy } from '@/lib/discord/bot-proxy';

export async function GET(req: NextRequest) {
  try {
    const authResult = await resolveAuthentication(req);
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const guildId = req.nextUrl.searchParams.get('guildId') || undefined;
    const inviteUrl = botProxy.getInviteUrl(guildId);

    return NextResponse.json({ inviteUrl });
  } catch (error) {
    console.error('[Discord Invite] Error:', error);
    return NextResponse.json({ error: 'Failed to generate invite URL' }, { status: 500 });
  }
}
