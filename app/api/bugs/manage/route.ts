import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAuth } from '@/lib/admin-auth'

// Get all bugs (admin only)
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdminAuth()

    if (!authResult.success) {
      return authResult.response
    }

    // Use service role key for admin operations (bypasses RLS)
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('[BUGS-MANAGE] Missing SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({
        error: 'Server configuration error: Missing service key'
      }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

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
    if (status) {
      query = query.eq('status', status)
    }
    if (priority) {
      query = query.eq('priority', priority)
    }
    if (category) {
      query = query.eq('category', category)
    }

    const { data: bugs, error } = await query

    if (error) {
      console.error('[BUGS-MANAGE] Database error:', error.message)
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
      bugs: bugs || [],
      statistics: stats,
      pagination: {
        limit,
        offset,
        hasMore: bugs?.length === limit
      }
    })

  } catch (error) {
    console.error('[BUGS-MANAGE] Error:', (error as Error).message)
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

    // Use service role key for admin operations (bypasses RLS)
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
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

    // Use service role key for admin operations (bypasses RLS)
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
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
      console.error('[BUGS-MANAGE] Delete error:', error)

      // Check for specific error types
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Cannot delete bug due to foreign key constraint',
          details: 'Please run database migration 032_fix_bug_audit_log_constraint.sql',
          hint: error.message
        }, { status: 500 })
      }

      return NextResponse.json({
        error: 'Failed to delete bug',
        details: error.message
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