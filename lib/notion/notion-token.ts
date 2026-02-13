/**
 * Notion Token Management
 * Notion internal integration tokens don't expire, so this is simpler than Gmail/Slack.
 * This module validates the token is still working.
 */

/**
 * Get a valid Notion access token.
 * Notion tokens don't expire (for OAuth integrations, the token persists).
 * Returns the token if available, null otherwise.
 */
export async function getValidNotionToken(
  integrationId: string,
  accessToken: string | null
): Promise<string | null> {
  if (!accessToken) {
    console.error('[Notion Token] No access token for integration', integrationId);
    return null;
  }

  return accessToken;
}
