/**
 * Notion OAuth Callback Handler
 * Exchanges authorization code for access token and creates integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { decodeDesktopState, validateDesktopUserId, postDesktopIntegrationResult, desktopCallbackHtml } from '@/lib/desktop-integration-state';

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID!;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET!;

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
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'notion', error });
        return new NextResponse(desktopCallbackHtml('Notion', false, error), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL(`/settings?notion_error=${error}`, req.url)
      );
    }

    if (!code) {
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'notion', error: 'no_code' });
        return new NextResponse(desktopCallbackHtml('Notion', false, 'No code received'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?notion_error=no_code', req.url)
      );
    }

    // Get user ID from cookie or desktop state
    let userId: string | null = null;
    if (desktopState) {
      userId = await validateDesktopUserId(desktopState.u);
      if (!userId) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'notion', error: 'invalid_user' });
        return new NextResponse(desktopCallbackHtml('Notion', false, 'Invalid user'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
    } else {
      const cookieStore = await cookies();
      userId = cookieStore.get('notion_oauth_uid')?.value || null;
      if (!userId) {
        return NextResponse.redirect(new URL('/settings?notion_error=no_user', req.url));
      }
    }

    // Exchange code for access token
    const basicAuth = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/integrations/notion/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Notion OAuth] Token exchange failed:', errorData);
      if (desktopState) {
        await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'notion', error: 'token_exchange_failed' });
        return new NextResponse(desktopCallbackHtml('Notion', false, 'Token exchange failed'), { status: 400, headers: { 'Content-Type': 'text/html' } });
      }
      return NextResponse.redirect(
        new URL('/settings?notion_error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const workspaceName = tokenData.workspace_name || '';
    const workspaceIcon = tokenData.workspace_icon || '';
    const workspaceId = tokenData.workspace_id || '';
    const botId = tokenData.bot_id || '';

    // Notion tokens don't expire (internal integrations)
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setFullYear(tokenExpiresAt.getFullYear() + 10);

    // Search to get a page count estimate
    const searchRes = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 1 }),
    });

    const searchData = searchRes.ok ? await searchRes.json() : { results: [] };

    // Create or update integration
    const { data: existingIntegration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'notion')
      .single();

    const integrationData = {
      user_id: userId,
      provider: 'notion',
      provider_user_id: workspaceId,
      access_token: accessToken,
      refresh_token: null,
      token_expires_at: tokenExpiresAt.toISOString(),
      provider_data: {
        workspace_name: workspaceName,
        workspace_icon: workspaceIcon,
        workspace_id: workspaceId,
        bot_id: botId,
        page_count: searchData.results?.length || 0,
        has_more: searchData.has_more || false,
      },
      status: 'active',
      last_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingIntegration) {
      await supabase
        .from('user_integrations')
        .update(integrationData)
        .eq('id', existingIntegration.id);
    } else {
      await supabase
        .from('user_integrations')
        .insert(integrationData);
    }

    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: true, provider: 'notion' });
      return new NextResponse(desktopCallbackHtml('Notion', true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Clear the cookie
    const response = NextResponse.redirect(
      new URL('/settings?notion_connected=true', req.url)
    );
    response.cookies.delete('notion_oauth_uid');

    return response;
  } catch (error) {
    console.error('[Notion OAuth Callback] Error:', error);
    if (desktopState) {
      await postDesktopIntegrationResult(desktopState.s, { success: false, provider: 'notion', error: 'unexpected' });
      return new NextResponse(desktopCallbackHtml('Notion', false, 'Unexpected error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
    return NextResponse.redirect(
      new URL('/settings?notion_error=unexpected', req.url)
    );
  }
}
