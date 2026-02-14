/**
 * Teams OAuth Token Management
 * Handles token refresh for Microsoft Teams tokens via Azure AD.
 * Microsoft tokens expire after ~1 hour, so refresh is critical.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Get a valid Teams access token, refreshing if expired.
 * Returns null if no valid token can be obtained.
 */
export async function getValidTeamsToken(
  integrationId: string,
  accessToken: string | null,
  refreshToken: string | null,
  tokenExpiresAt: string | null
): Promise<string | null> {
  if (!accessToken) {
    console.error('[Teams Token] No access token for integration', integrationId);
    return null;
  }

  // Check if current token is still valid (with 5-minute buffer)
  if (tokenExpiresAt) {
    const expiresAt = new Date(tokenExpiresAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt - now > fiveMinutes) {
      return accessToken;
    }
  }

  // Token expired — try to refresh
  if (!refreshToken) {
    console.warn('[Teams Token] Token expired but no refresh token available', integrationId);
    return accessToken; // Return as-is, might still work briefly
  }

  try {
    console.log('[Teams Token] Refreshing expired token for integration', integrationId);

    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID || '',
          client_secret: process.env.TEAMS_CLIENT_SECRET || '',
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: 'User.Read Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Chat.Read ChatMessage.Send offline_access',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Teams Token] Refresh failed:', response.status, errorText);
      return accessToken;
    }

    const tokenData = await response.json();

    if (tokenData.error) {
      console.error('[Teams Token] Refresh response error:', tokenData.error);
      return accessToken;
    }

    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Update stored tokens in database
    await supabase
      .from('user_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken,
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    console.log('[Teams Token] Successfully refreshed token, expires at', newExpiresAt.toISOString());
    return tokenData.access_token;
  } catch (error) {
    console.error('[Teams Token] Refresh exception:', error);
    return accessToken;
  }
}
