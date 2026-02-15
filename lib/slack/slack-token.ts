/**
 * Slack OAuth Token Management
 * Handles token refresh for Slack tokens.
 * Note: Standard Slack bot tokens don't expire. Token rotation is opt-in.
 * This module handles both cases.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Get a valid Slack access token, refreshing if expired.
 * Returns null if no valid token can be obtained.
 */
export async function getValidSlackToken(
  integrationId: string,
  accessToken: string | null,
  refreshToken: string | null,
  tokenExpiresAt: string | null
): Promise<string | null> {
  if (!accessToken) {
    console.error('[Slack Token] No access token for integration', integrationId);
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
  } else {
    // No expiration set — Slack tokens without rotation don't expire
    return accessToken;
  }

  // Token expired — try to refresh (only if token rotation is enabled)
  if (!refreshToken) {
    console.warn('[Slack Token] Token may be expired but no refresh token available', integrationId);
    return accessToken; // Return as-is, might still work
  }

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID || '',
        client_secret: process.env.SLACK_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack Token] Refresh failed:', response.status, errorText);
      return accessToken;
    }

    const tokenData = await response.json();

    if (!tokenData.ok) {
      console.error('[Slack Token] Refresh response error:', tokenData.error);
      return accessToken;
    }

    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (tokenData.expires_in || 43200));

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

    return tokenData.access_token;
  } catch (error) {
    console.error('[Slack Token] Refresh exception:', error);
    return accessToken;
  }
}
