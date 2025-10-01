import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminAuth } from '@/lib/admin-auth'

// Get all bugs (admin only)
export async function GET(request: NextRequest) {
  console.log('[BUGS-MANAGE] === Starting bugs retrieval ===')

  try {
    // Verify admin access
    console.log('[BUGS-MANAGE] Checking admin authentication...')
    const authResult = await requireAdminAuth()

    if (!authResult.success) {
      console.log('[BUGS-MANAGE] ❌ Admin auth failed, returning 401/403')
      return authResult.response
    }

    console.log('[BUGS-MANAGE] ✅ Admin auth successful:', authResult.session?.user.email)

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
    console.log('[BUGS-MANAGE] Supabase SSR client created')

    // Parse query parameters for filtering
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    console.log('[BUGS-MANAGE] Query params:', { status, priority, category, limit, offset })

    // Build query
    console.log('[BUGS-MANAGE] Building query...')
    let query = supabase
      .from('bugs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (status) {
      query = query.eq('status', status)
      console.log('[BUGS-MANAGE] Filter: status =', status)
    }
    if (priority) {
      query = query.eq('priority', priority)
      console.log('[BUGS-MANAGE] Filter: priority =', priority)
    }
    if (category) {
      query = query.eq('category', category)
      console.log('[BUGS-MANAGE] Filter: category =', category)
    }

    console.log('[BUGS-MANAGE] Executing query...')
    const { data: bugs, error } = await query

    if (error) {
      console.error('[BUGS-MANAGE] ❌ Database query error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      return NextResponse.json({
        error: 'Failed to fetch bugs'
      }, { status: 500 })
    }

    console.log('[BUGS-MANAGE] ✅ Query successful, found', bugs?.length || 0, 'bugs')

    // Get statistics
    console.log('[BUGS-MANAGE] Fetching statistics...')
    const { data: stats, error: statsError } = await supabase
      .from('bug_statistics')
      .select('*')
      .single()

    if (statsError) {
      console.log('[BUGS-MANAGE] ⚠️  Statistics view not available:', statsError.message)
    } else {
      console.log('[BUGS-MANAGE] ✅ Statistics fetched')
    }

    console.log('[BUGS-MANAGE] === Bugs retrieval complete ===')
    return NextResponse.json({
      bugs: bugs || [],
      statistics: stats,
      pagination: {
        limit,
        offset,
        hasMore: bugs?.length === limit
      }
    })

  } catch (error) {
    console.error('[BUGS-MANAGE] ❌ Uncaught error:', error)
    console.error('[BUGS-MANAGE] Error stack:', (error as Error).stack)
    return NextResponse.json({
      error: 'Internal server error',
      details: (error as Error).message
    }, { status: 500 })
  }
}

// Update bug status, priority, or other fields (admin only)
export async function PUT(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdminAuth()
    if (!authResult.success) {
      return authResult.response
    }

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
    const body = await request.json()
    const { bugId, updates } = body

    if (!bugId) {
      return NextResponse.json({
        error: 'Bug ID is required'
      }, { status: 400 })
    }

    // Validate allowed update fields
    const allowedFields = [
      'status', 'priority', 'category', 'admin_notes',
      'assigned_to', 'resolved_at'
    ]

    const sanitizedUpdates: any = {}
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        sanitizedUpdates[key] = updates[key]
      }
    })

    // Auto-set resolved_at when status changes to resolved
    if (sanitizedUpdates.status === 'resolved' && !sanitizedUpdates.resolved_at) {
      sanitizedUpdates.resolved_at = new Date().toISOString()
    }

    // Clear resolved_at when status changes away from resolved
    if (sanitizedUpdates.status && sanitizedUpdates.status !== 'resolved') {
      sanitizedUpdates.resolved_at = null
    }

    const { data: bug, error } = await supabase
      .from('bugs')
      .update(sanitizedUpdates)
      .eq('id', bugId)
      .select()
      .single()

    if (error) {
      console.error('Error updating bug:', error)
      return NextResponse.json({
        error: 'Failed to update bug'
      }, { status: 500 })
    }

    console.log(`🐛 Bug updated: ${bug.title} (Status: ${bug.status}, Priority: ${bug.priority})`)

    return NextResponse.json({
      success: true,
      bug
    })

  } catch (error) {
    console.error('Bug update error:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// Delete bug (admin only)
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdminAuth()
    if (!authResult.success) {
      return authResult.response
    }

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
    const { searchParams } = new URL(request.url)
    const bugId = searchParams.get('id')

    if (!bugId) {
      return NextResponse.json({
        error: 'Bug ID is required'
      }, { status: 400 })
    }

    const { error } = await supabase
      .from('bugs')
      .delete()
      .eq('id', bugId)

    if (error) {
      console.error('Error deleting bug:', error)
      return NextResponse.json({
        error: 'Failed to delete bug'
      }, { status: 500 })
    }

    console.log(`🗑️ Bug deleted: ${bugId}`)

    return NextResponse.json({
      success: true,
      message: 'Bug deleted successfully'
    })

  } catch (error) {
    console.error('Bug deletion error:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}