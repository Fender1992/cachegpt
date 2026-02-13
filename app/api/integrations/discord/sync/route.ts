/**
 * Discord Sync API (Deprecated)
 * Discord context is now fetched on demand at query time via bot proxy.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    message: 'Sync deprecated — Discord context is now fetched on demand',
    status: 'deprecated',
  });
}
