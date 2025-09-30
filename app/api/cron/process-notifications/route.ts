/**
 * Cron job endpoint to process pending bug notifications
 * Should be called by a cron service (e.g., Vercel Cron, GitHub Actions, or external cron)
 *
 * Setup:
 * 1. Add to vercel.json crons array with path and schedule (every 5 minutes)
 * 2. Or call via external cron with Authorization Bearer token
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processPendingNotifications } from '@/lib/email-notifications'

// Verify cron authorization
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')

  // Check for Vercel Cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return false
    }
  }

  // For Vercel Cron, also check the x-vercel-cron header
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  if (vercelCronHeader === '1') {
    return true
  }

  // If no auth configured, allow in development
  if (process.env.NODE_ENV === 'development') {
    console.warn('[CRON] Running in development mode without authentication')
    return true
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyCronAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[CRON] Starting notification processing job...')

    // Create Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Process notifications
    const result = await processPendingNotifications(supabase)

    console.log('[CRON] Notification processing complete:', result)

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[CRON] Error processing notifications:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Also support GET for manual triggering via browser
export async function GET(request: NextRequest) {
  return POST(request)
}
