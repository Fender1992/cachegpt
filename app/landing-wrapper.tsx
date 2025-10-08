import { getServerFlags } from '@/lib/featureFlags';
import CasualLanding from '@/components/landing/CasualLanding';
import { createClient } from '@/lib/supabase-server';

/**
 * Server component wrapper that chooses between casual and classic landing
 * based on feature flag: ui_casual_landing
 */
export default async function LandingWrapper({
  ClassicLanding,
}: {
  ClassicLanding: React.ComponentType;
}) {
  // Get user ID if authenticated
  let userId: string | undefined;
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId = session?.user?.id;
  } catch (error) {
    // Not authenticated, use anonymous flags
  }

  // Get feature flags
  const flags = await getServerFlags(userId);

  // Get A/B test variant for hero copy
  const variant = flags.ab_landing_hero_copy_v1;

  // Render casual landing if flag is enabled
  if (flags.ui_casual_landing) {
    return <CasualLanding variant={variant} />;
  }

  // Otherwise render classic landing
  return <ClassicLanding />;
}
