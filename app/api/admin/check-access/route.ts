import { NextResponse } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/admin-auth'

/**
 * Check if current user has admin access
 * Used by client-side components to verify admin status
 */
export async function GET() {
  try {
    const isAdmin = await isCurrentUserAdmin()

    return NextResponse.json({
      isAdmin,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      isAdmin: false,
      timestamp: new Date().toISOString()
    })
  }
}
