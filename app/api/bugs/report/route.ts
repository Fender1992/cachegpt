import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { error as logError, info as logInfo } from '@/lib/logger'

export async function POST(request: NextRequest) {
  console.log('[BUG-REPORT] === Starting bug report submission ===')

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
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
    console.log('[BUG-REPORT] Supabase SSR client created')

    // Parse request body
    const body = await request.json()
    console.log('[BUG-REPORT] Request body:', {
      hasTitle: !!body.title,
      hasDescription: !!body.description,
      category: body.category,
      priority: body.priority,
      hasScreenshot: !!body.screenshotUrl
    })

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
      console.log('[BUG-REPORT] ❌ Validation failed: missing title or description')
      return NextResponse.json({
        error: 'Title and description are required'
      }, { status: 400 })
    }

    // Get user session (optional - bugs can be submitted anonymously)
    console.log('[BUG-REPORT] Fetching user session...')
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[BUG-REPORT] Session error:', sessionError)
    } else {
      console.log('[BUG-REPORT] Session:', session ? `User: ${session.user.email}` : 'Anonymous')

    }

    // Collect browser/device information
    console.log('[BUG-REPORT] Collecting browser info...')
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const browserInfo = {
      userAgent,
      timestamp: new Date().toISOString(),
      url: url || request.headers.get('referer'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    }
    console.log('[BUG-REPORT] Browser info:', browserInfo)

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
    console.log('[BUG-REPORT] Insert data prepared:', {
      title: insertData.title,
      priority: insertData.priority,
      category: insertData.category,
      hasUserId: !!insertData.user_id,
      hasScreenshot: !!insertData.screenshot_url
    })

    // Insert bug report
    console.log('[BUG-REPORT] Inserting into database...')
    const { data: bug, error } = await supabase
      .from('bugs')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[BUG-REPORT] ❌ Database insert error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      logError('Error creating bug report', error)

      // Check if it's a table not found error
      if (error.message?.includes('relation "bugs" does not exist')) {
        return NextResponse.json({
          error: 'Bug tracking system not yet initialized. Please contact admin.',
          details: 'Database migration required'
        }, { status: 503 })
      }

      console.log('[BUG-REPORT] ❌ Returning 500 error to client')
      return NextResponse.json({
        error: 'Failed to submit bug report',
        details: error.message
      }, { status: 500 })
    }

    console.log('[BUG-REPORT] ✅ Bug created successfully:', bug.id)

    // Log for admin notification (you could add email notification here)
    logInfo(`New bug report: ${title} (Priority: ${priority}, Category: ${category})`)

    console.log('[BUG-REPORT] === Bug submission complete ===')
    return NextResponse.json({
      success: true,
      message: 'Bug report submitted successfully',
      bugId: bug.id
    })

  } catch (error) {
    console.error('[BUG-REPORT] ❌ Uncaught error:', error)
    console.error('[BUG-REPORT] Error stack:', (error as Error).stack)
    logError('Bug report submission error', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: (error as Error).message
    }, { status: 500 })
  }
}