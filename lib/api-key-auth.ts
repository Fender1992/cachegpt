/**
 * API Key Authentication
 * Validates CacheGPT API keys (cgpt_sk_*) for programmatic access
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
);

export interface ApiKeySession {
  user: {
    id: string;
    email: string;
    user_metadata?: any;
  };
  authMethod: 'api_key';
  keyId: string;
  isValid: boolean;
}

/**
 * Hash API key using SHA-256
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Validate API key and return user session
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeySession | null> {
  if (!apiKey || !apiKey.startsWith('cgpt_sk_')) {
    return null;
  }

  try {
    // Hash the key to look it up in database
    const keyHash = hashApiKey(apiKey);

    // Validate the key using the database function
    const { data, error } = await supabase
      .rpc('validate_cachegpt_api_key', { api_key_hash: keyHash });

    if (error) {
      console.error('API key validation error:', error);
      return null;
    }

    // Check if we got a valid result
    if (!data || data.length === 0 || !data[0].is_valid) {
      return null;
    }

    const keyInfo = data[0];

    // Get user information
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      keyInfo.user_id
    );

    if (userError || !userData?.user) {
      console.error('Failed to get user for API key:', userError);
      return null;
    }

    // Increment usage counter asynchronously (don't wait)
    supabase.rpc('increment_api_key_usage', { api_key_hash: keyHash })
      .then(() => {})
      .catch(err => console.error('Failed to increment API key usage:', err));

    return {
      user: {
        id: userData.user.id,
        email: userData.user.email || '',
        user_metadata: userData.user.user_metadata,
      },
      authMethod: 'api_key',
      keyId: keyInfo.key_id,
      isValid: true,
    };
  } catch (error) {
    console.error('API key validation exception:', error);
    return null;
  }
}

/**
 * Extract API key from Authorization header
 * Supports: "Bearer cgpt_sk_..." or "cgpt_sk_..."
 */
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  // Remove "Bearer " prefix if present
  const key = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // Validate format
  if (key.startsWith('cgpt_sk_')) {
    return key;
  }

  return null;
}
