import { NextRequest, NextResponse } from 'next/server'

// Cron job endpoint for automatic model updates
// Called daily via Vercel cron jobs
export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'fallback-secret'

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('Running daily model update check...')

    // Force refresh of model configuration
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://cachegpt.app'}/api/model-updates`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'CacheGPT-Cron/1.0'
      }
    })

    if (response.ok) {
      const data = await response.json()
      console.log('Model configuration updated:', {
        lastUpdated: data.lastUpdated,
        autoUpdate: data.autoUpdate,
        providersCount: Object.keys(data.providers).length
      })

      return NextResponse.json({
        success: true,
        message: 'Model configuration updated successfully',
        lastUpdated: data.lastUpdated,
        providersUpdated: Object.keys(data.providers).length
      })
    } else {
      throw new Error(`Failed to fetch model updates: ${response.status}`)
    }
  } catch (error: any) {
    console.error('Cron model update failed:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update models'
    }, { status: 500 })
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}