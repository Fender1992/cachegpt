import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { requireAdminAuth } from '@/lib/admin-auth'

// Update bug status, priority, or other fields (admin only)
export async function PUT(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdminAuth()
    if (!authResult.success) {
      return authResult.response
    }

    const supabase = createRouteHandlerClient({ cookies })
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

    const supabase = createRouteHandlerClient({ cookies })
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