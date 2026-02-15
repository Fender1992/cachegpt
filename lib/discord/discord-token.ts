/**
 * Discord OAuth Token Management
 * Handles token refresh when the stored access token has expired.
 */

import { createClient } from '@supabase/supabase-js';

const DISCORD_API = 'https://discord.com/api/v10';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Get a valid Discord access token, refreshing if expired.
 * Returns null if no valid token can be obtained.
 */
export async function getValidDiscordToken(
  integrationId: string,
  accessToken: string | null,
  refreshToken: string | null,
  tokenExpiresAt: string | null
): Promise<string | null> {
  // Check if current token is still valid (with 5-minute buffer)
  if (accessToken && tokenExpiresAt) {
    const expiresAt = new Date(tokenExpiresAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt - now > fiveMinutes) {
      return accessToken;
    }
  }

  // Token expired or missing — try to refresh
  if (!refreshToken) {
    console.error('[Discord Token] No refresh token available for integration', integrationId);
    return accessToken; // Return expired token as last resort (might still work)
  }

  try {
    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '',
        client_secret: process.env.DISCORD_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Discord Token] Refresh failed:', response.status, errorText);
      return accessToken; // Return expired token as last resort
    }

    const tokenData = await response.json();
    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenData;

    // Calculate new expiration
    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expires_in);

    // Update stored tokens in database
    await supabase
      .from('user_integrations')
      .update({
        access_token: access_token,
        refresh_token: newRefreshToken || refreshToken,
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    return access_token;
  } catch (error) {
    console.error('[Discord Token] Refresh exception:', error);
    return accessToken; // Return expired token as last resort
  }
}
