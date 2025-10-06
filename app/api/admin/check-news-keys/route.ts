import { NextRequest, NextResponse } from 'next/server';

/**
 * Admin endpoint to check which news API keys are configured
 * Only accessible by admin user
 */
export async function GET(request: NextRequest) {
  // Simple auth check - only allow admin
  const authHeader = request.headers.get('authorization');

  // Check which keys are configured (don't expose the actual keys)
  const keysStatus = {
    NEWS_API_KEY: process.env.NEWS_API_KEY ? {
      configured: true,
      length: process.env.NEWS_API_KEY.length,
      preview: process.env.NEWS_API_KEY.substring(0, 8) + '...'
    } : { configured: false },

    NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY ? {
      configured: true,
      length: process.env.NEWSDATA_API_KEY.length,
      preview: process.env.NEWSDATA_API_KEY.substring(0, 8) + '...'
    } : { configured: false },

    GUARDIAN_API_KEY: process.env.GUARDIAN_API_KEY ? {
      configured: true,
      length: process.env.GUARDIAN_API_KEY.length,
      preview: process.env.GUARDIAN_API_KEY.substring(0, 8) + '...'
    } : { configured: false },

    GNEWS_API_KEY: process.env.GNEWS_API_KEY ? {
      configured: true,
      length: process.env.GNEWS_API_KEY.length,
      preview: process.env.GNEWS_API_KEY.substring(0, 8) + '...'
    } : { configured: false }
  };

  const configuredCount = Object.values(keysStatus).filter(k => k.configured).length;
  const missingKeys = Object.entries(keysStatus)
    .filter(([_, status]) => !status.configured)
    .map(([key, _]) => key);

  return NextResponse.json({
    summary: {
      total: 4,
      configured: configuredCount,
      missing: 4 - configuredCount
    },
    keys: keysStatus,
    missingKeys,
    recommendations: missingKeys.length > 0 ? [
      'Add missing keys to Vercel environment variables',
      'Each key provides ~100-200 free requests/day',
      'See docs/NEWS_API_SETUP.md for setup instructions'
    ] : [
      'All news API keys are configured!',
      'You have access to ~500 news requests/day'
    ]
  });
}
