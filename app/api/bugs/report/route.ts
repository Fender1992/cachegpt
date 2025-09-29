import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

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
    const { data: { session } } = await supabase.auth.getSession()

    // Collect browser/device information
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const browserInfo = {
      userAgent,
      timestamp: new Date().toISOString(),
      url: url || request.headers.get('referer'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    }

    // Insert bug report
    const { data: bug, error } = await supabase
      .from('bugs')
      .insert({
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
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating bug report:', error)

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

    // Log for admin notification (you could add email notification here)
    console.log(`🐛 New bug report: ${title} (Priority: ${priority}, Category: ${category})`)

    return NextResponse.json({
      success: true,
      message: 'Bug report submitted successfully',
      bugId: bug.id
    })

  } catch (error) {
    console.error('Bug report submission error:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// GET endpoint to retrieve bugs (admin only)
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Check admin access
    const { data: { session } } = await supabase.auth.getSession()

    if (!session || session.user.email !== 'rolandofender@gmail.com') {
      return NextResponse.json({
        error: 'Admin access required'
      }, { status: 403 })
    }

    // Parse query parameters for filtering
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('bugs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)
    if (category) query = query.eq('category', category)

    const { data: bugs, error } = await query

    if (error) {
      console.error('Error fetching bugs:', error)
      return NextResponse.json({
        error: 'Failed to fetch bugs'
      }, { status: 500 })
    }

    // Get statistics
    const { data: stats } = await supabase
      .from('bug_statistics')
      .select('*')
      .single()

    return NextResponse.json({
      bugs,
      statistics: stats,
      pagination: {
        limit,
        offset,
        hasMore: bugs.length === limit
      }
    })

  } catch (error) {
    console.error('Bug retrieval error:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}