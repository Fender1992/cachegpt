import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthentication, getUserId, isAuthError } from '@/lib/unified-auth-resolver';
import { getServerFlags } from '@/lib/featureFlags';

/**
 * GET /api/feature-flags
 * Returns current feature flags for the user
 */
export async function GET(request: NextRequest) {
  try {
    // Get user ID if authenticated
    const session = await resolveAuthentication(request);
    const userId = !isAuthError(session) ? getUserId(session) : undefined;

    // Fetch flags
    const flags = await getServerFlags(userId || undefined);

    return NextResponse.json({
      flags,
    });

  } catch (error: any) {
    console.error('[FEATURE-FLAGS-API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flags' },
      { status: 500 }
    );
  }
}
