/**
 * Feature Flag System for CacheGPT
 *
 * Resolution order:
 * 1. Environment variables (highest priority)
 * 2. Database overrides
 * 3. User-specific overrides
 * 4. Default values (lowest priority)
 *
 * Flags are cached in memory for 60 seconds to reduce DB load
 */

import { createClient } from '@/lib/supabase-server';
import { FlagKey, FeatureFlags, FlagValue } from '@/types/featureFlags';

// Default flag values
const DEFAULT_FLAGS: FeatureFlags = {
  // UI flags - casual landing is now the default
  ui_casual_landing: true, // NOW DEFAULT: Friendly landing for casual users
  ui_casual_chat: false,
  ui_modes: false,
  ui_casual_dashboard: false,

  // UX flags (default OFF)
  ux_gamified_toasts: false,
  ux_voice_input: false,
  ux_file_upload: false,
  ux_cache_badges: false,
  ux_example_prompts: false,

  // A/B test defaults
  ab_landing_hero_copy_v1: 'A',
  ab_example_prompts_layout_v1: 'grid',
  ab_onboarding_flow_v1: 'old',
};

// In-memory cache
interface CacheEntry {
  flags: FeatureFlags;
  timestamp: number;
}

const flagCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Get feature flags for a user (server-side only)
 */
export async function getServerFlags(userId?: string): Promise<FeatureFlags> {
  const cacheKey = userId || 'anonymous';

  // Check cache
  const cached = flagCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.flags;
  }

  // Start with defaults
  let flags = { ...DEFAULT_FLAGS };

  // 1. Apply environment variable overrides
  flags = applyEnvOverrides(flags);

  // 2. Apply database global overrides
  try {
    const dbFlags = await getDbFlags();
    flags = { ...flags, ...dbFlags };
  } catch (error) {
    console.error('[FLAGS] Error fetching DB flags:', error);
  }

  // 3. Apply user-specific overrides
  if (userId) {
    try {
      const userFlags = await getUserFlags(userId);
      flags = { ...flags, ...userFlags };
    } catch (error) {
      console.error('[FLAGS] Error fetching user flags:', error);
    }
  }

  // 4. Apply A/B test assignments
  if (userId) {
    flags = applyABTests(flags, userId);
  }

  // Cache the result
  flagCache.set(cacheKey, {
    flags,
    timestamp: Date.now(),
  });

  return flags;
}

/**
 * Get flags from environment variables
 */
function applyEnvOverrides(flags: FeatureFlags): FeatureFlags {
  const envFlags = { ...flags };

  // Check each flag in environment
  Object.keys(DEFAULT_FLAGS).forEach((key) => {
    const envKey = `FEATURE_${key.toUpperCase()}`;
    const envValue = process.env[envKey];

    if (envValue !== undefined) {
      // Parse boolean
      if (envValue === 'true') {
        (envFlags as any)[key] = true;
      } else if (envValue === 'false') {
        (envFlags as any)[key] = false;
      } else {
        // String/number value
        (envFlags as any)[key] = envValue;
      }
    }
  });

  return envFlags;
}

/**
 * Get global flags from database
 */
async function getDbFlags(): Promise<Partial<FeatureFlags>> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, value, enabled')
      .eq('enabled', true)
      .is('user_id', null); // Global flags only

    if (error) throw error;

    const dbFlags: Partial<FeatureFlags> = {};
    data?.forEach((flag) => {
      (dbFlags as any)[flag.key] = parseValue(flag.value);
    });

    return dbFlags;
  } catch (error) {
    // Table might not exist yet, return empty
    return {};
  }
}

/**
 * Get user-specific flag overrides
 */
async function getUserFlags(userId: string): Promise<Partial<FeatureFlags>> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, value, enabled')
      .eq('user_id', userId)
      .eq('enabled', true);

    if (error) throw error;

    const userFlags: Partial<FeatureFlags> = {};
    data?.forEach((flag) => {
      (userFlags as any)[flag.key] = parseValue(flag.value);
    });

    return userFlags;
  } catch (error) {
    return {};
  }
}

/**
 * Apply A/B test assignments based on user ID
 */
function applyABTests(flags: FeatureFlags, userId: string): FeatureFlags {
  const hash = hashUserId(userId);

  return {
    ...flags,
    // Landing hero copy: 50/50 split
    ab_landing_hero_copy_v1: hash % 2 === 0 ? 'A' : 'B',
    // Example prompts layout: 50/50 split
    ab_example_prompts_layout_v1: (hash % 4) < 2 ? 'grid' : 'list',
    // Onboarding flow: 80/20 (old/new)
    ab_onboarding_flow_v1: (hash % 10) < 8 ? 'old' : 'new',
  };
}

/**
 * Simple hash function for user ID
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Parse flag value from database
 */
function parseValue(value: any): FlagValue {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value))) return Number(value);
  return value;
}

/**
 * Check if a specific flag is enabled
 */
export async function isFeatureEnabled(
  flag: FlagKey,
  userId?: string
): Promise<boolean> {
  const flags = await getServerFlags(userId);
  const value = flags[flag];
  return typeof value === 'boolean' ? value : Boolean(value);
}

/**
 * Invalidate flag cache (call after updating flags in DB)
 */
export function invalidateFlagCache(userId?: string) {
  if (userId) {
    flagCache.delete(userId);
  } else {
    flagCache.clear();
  }
}

/**
 * Get flags for client-side use (sanitized)
 */
export async function getClientFlags(userId?: string): Promise<FeatureFlags> {
  const flags = await getServerFlags(userId);

  // Return all flags - client needs them for rendering
  return flags;
}
