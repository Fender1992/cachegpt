/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to session health monitoring, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * After making changes, update the STATUS file with:
 * - Changes to session expiry handling
 * - Impact on user experience
 * - Any new monitoring capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAuthentication,
  isUnifiedSession,
  isAuthError,
  isSessionHealthy,
  getSessionTimeToExpiry,
  logAuthMethodUsage
} from '@/lib/unified-auth-resolver';

/**
 * Session health check endpoint
 * Returns session status and expiry information for proactive monitoring
 */
export async function GET(request: NextRequest) {
  try {
    // Resolve authentication using unified resolver
    const authResult = await resolveAuthentication(request);

    if (isAuthError(authResult)) {
      return NextResponse.json({
        healthy: false,
        error: authResult.error,
        recommendation: 'Please log in again to continue.'
      }, { status: authResult.status });
    }

    const session = authResult as any;
    logAuthMethodUsage(session, '/api/auth/session-health');

    const timeToExpiry = getSessionTimeToExpiry(session);
    const healthy = isSessionHealthy(session);

    // Create health status response
    const healthStatus = {
      healthy,
      authMethod: session.authMethod,
      expiresAt: session.expiresAt,
      timeToExpirySeconds: timeToExpiry,
      timeToExpiryMinutes: timeToExpiry ? Math.floor(timeToExpiry / 60) : null,
      lastValidated: session.lastValidated,
      canRefresh: session.authMethod === 'cookie' && !!session.refreshToken,
      recommendation: getHealthRecommendation(session, healthy, timeToExpiry)
    };

    return NextResponse.json(healthStatus);

  } catch (error: any) {
    console.error('Session health check error:', error);
    return NextResponse.json({
      healthy: false,
      error: 'Unable to check session health',
      recommendation: 'Please try logging in again.'
    }, { status: 500 });
  }
}

/**
 * Get health recommendation based on session state
 */
function getHealthRecommendation(session: any, healthy: boolean, timeToExpiry: number | null): string {
  if (!healthy && timeToExpiry !== null) {
    if (timeToExpiry <= 0) {
      if (session.authMethod === 'bearer') {
        return 'Your token has expired. Please run `cachegpt login` to authenticate again.';
      } else {
        return 'Your session has expired. Please refresh the page and log in again.';
      }
    }

    if (timeToExpiry < 600) { // Less than 10 minutes
      if (session.authMethod === 'bearer') {
        return `Your token expires in ${Math.floor(timeToExpiry / 60)} minutes. Consider running \`cachegpt login\` soon.`;
      } else {
        return `Your session expires in ${Math.floor(timeToExpiry / 60)} minutes. The system will attempt to refresh automatically.`;
      }
    }
  }

  return healthy ? 'Session is healthy and active.' : 'Session may need attention soon.';
}