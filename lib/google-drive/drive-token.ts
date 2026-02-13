/**
 * Google Drive OAuth Token Management
 * Handles token refresh when the stored access token has expired.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Get a valid Google Drive access token, refreshing if expired.
 * Returns null if no valid token can be obtained.
 */
export async function getValidDriveToken(
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
    console.error('[Drive Token] No refresh token available for integration', integrationId);
    return accessToken;
  }

  try {
    console.log('[Drive Token] Refreshing expired token for integration', integrationId);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Drive Token] Refresh failed:', response.status, errorText);
      return accessToken;
    }

    const tokenData = await response.json();
    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenData;

    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expires_in);

    await supabase
      .from('user_integrations')
      .update({
        access_token: access_token,
        refresh_token: newRefreshToken || refreshToken,
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    console.log('[Drive Token] Successfully refreshed token, expires at', newExpiresAt.toISOString());
    return access_token;
  } catch (error) {
    console.error('[Drive Token] Refresh exception:', error);
    return accessToken;
  }
}
