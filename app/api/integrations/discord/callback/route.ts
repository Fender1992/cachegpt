/**
 * Discord OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(req: NextRequest) {
  let desktopState: ReturnType<typeof decodeDesktopState> = null;
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    const stateParam = searchParams.get('state');
    desktopState = decodeDesktopState(stateParam);
    
    if (error) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'discord', error });
        return new NextResponse(desktopCallbackHtml('Discord', false, error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?discord_error=${error}`, req.url)
      );
    }

    if (!code) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'discord', error: 'no_code' });
        return new NextResponse(desktopCallbackHtml('Discord', false, 'No authorization code'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?discord_error=no_code', req.url)
      );
    }

    let userId: string | null = null;
    if (desktopState) {
      userId = await validateDesktopUserId(desktopState.u);
      if (!userId) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'discord', error: 'invalid_user' });
        return new NextResponse(desktopCallbackHtml('Discord', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
    } else {
      const cookieStore = await cookies();
      userId = cookieStore.get('discord_oauth_uid')?.value || null;
      if (!userId) {
        return NextResponse.redirect(
          new URL('/settings?discord_error=no_user', req.url)
        );
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/discord/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Discord OAuth] Token exchange failed:', errorData);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'discord', error: 'token_exchange_failed' });
        return new NextResponse(desktopCallbackHtml('Discord', false, 'Token exchange failed'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?discord_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope, guild } = tokenData;
    // Get Discord user info
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userResponse.ok) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'discord', error: 'user_fetch_failed' });
        return new NextResponse(desktopCallbackHtml('Discord', false, 'Failed to fetch Discord user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?discord_error=user_fetch_failed', req.url)
      );
    }

    const discordUser = await userResponse.json();

    // Get user's guilds (servers)
    const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const guilds = guildsResponse.ok ? await guildsResponse.json() : [];

    // Calculate token expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expires_in);

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'discord')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'discord',
      provider_user_id: discordUser.id,
      access_token,
      refresh_token,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        global_name: discordUser.global_name,
        avatar: discordUser.avatar,
        email: discordUser.email,
        verified: discordUser.verified,
        scope: scope.split(' '),
        guild_count: guilds.length,
        guilds: guilds.slice(0, 10).map((g: any) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          owner: g.owner,
          permissions: g.permissions,
        })),
      },
      status: 'active',
      last_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let integrationId: string;

    if (existingIntegration) {
      const { data: updated } = await supabase
        .from('user_integrations')
        .update(integrationData)
        .eq('id', existingIntegration.id)
        .select()
        .single();
      integrationId = updated.id;
    } else {
      const { data: created } = await supabase
        .from('user_integrations')
        .insert(integrationData)
        .select()
        .single();
      integrationId = created.id;
    }

    // Store guild metadata for the guilds we have access to
    if (guilds.length > 0 && integrationId) {
      const guildMetadata = guilds
        .filter((g: any) => (BigInt(g.permissions) & BigInt(0x400)) === BigInt(0x400)) // READ_MESSAGES permission
        .map((guild: any) => ({
          integration_id: integrationId,
          guild_id: guild.id,
          guild_name: guild.name,
          icon_url: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
          owner_id: guild.owner ? discordUser.id : null,
          member_count: guild.approximate_member_count || 0,
          premium_tier: guild.premium_tier || 0,
          features: guild.features || [],
        }));

      if (guildMetadata.length > 0) {
        await supabase
          .from('discord_guild_metadata')
          .upsert(guildMetadata, { onConflict: 'integration_id,guild_id' });
      }
    }

    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'discord' });
      return new NextResponse(desktopCallbackHtml('Discord', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the cookie
    const response = NextResponse.redirect(
      new URL('/settings?discord_connected=true', req.url)
    );
    response.cookies.delete('discord_oauth_uid');

    return response;
  } catch (error) {
    console.error('[Discord OAuth Callback] Error:', error);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'discord', error: 'unexpected' });
      return new NextResponse(desktopCallbackHtml('Discord', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(
      new URL('/settings?discord_error=unexpected', req.url)
    );
  }
}