import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { error as logError, info as logInfo } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // Use regular client for session check
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Create service role client for database insert (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Parse request body
    const body = await request.json()

    const {
      title,
      description,
      category = 'general',
      priority = 'medium',
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      url,
      screenshotUrl
    } = body

    // Validate required fields
    if (!title || !description) {
      return NextResponse.json({
        error: 'Title and description are required'
      }, { status: 400 })
    }

    // Get user session (optional - bugs can be submitted anonymously)
    const { data: { session } } = await supabaseAuth.auth.getSession()

    // Collect browser/device information
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const browserInfo = {
      userAgent,
      timestamp: new Date().toISOString(),
      url: url || request.headers.get('referer'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    }

    // Prepare insert data
    const insertData = {
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      user_id: session?.user?.id || null,
      user_email: session?.user?.email || null,
      user_agent: userAgent,
      url: url || browserInfo.url,
      steps_to_reproduce: stepsToReproduce?.trim() || null,
      expected_behavior: expectedBehavior?.trim() || null,
      actual_behavior: actualBehavior?.trim() || null,
      browser_info: browserInfo,
      screenshot_url: screenshotUrl || null,
      status: 'open'
    }

    // Insert bug report
    const { data: bug, error } = await supabase
      .from('bugs')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      logError('Error creating bug report', error)

      // Check if it's a table not found error
      if (error.message?.includes('relation "bugs" does not exist')) {
        return NextResponse.json({
          error: 'Bug tracking system not yet initialized. Please contact admin.',
          details: 'Database migration required'
        }, { status: 503 })
      }

      return NextResponse.json({
        error: 'Failed to submit bug report',
        details: error.message
      }, { status: 500 })
    }

    // Log for admin notification
    logInfo(`New bug report: ${title} (Priority: ${priority}, Category: ${category})`)

    return NextResponse.json({
      success: true,
      message: 'Bug report submitted successfully',
      bugId: bug.id
    })

  } catch (error) {
    logError('Bug report submission error', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: (error as Error).message
    }, { status: 500 })
  }
}