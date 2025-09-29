import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Admin email - only this email has admin access
const ADMIN_EMAIL = 'fender1992@gmail.com' // Replace with your actual email

export interface AdminSession {
  user: {
    id: string
    email: string
  }
  isAdmin: true
}

/**
 * Verifies admin access for protected routes
 * Returns admin session if user is authenticated admin, otherwise throws/redirects
 */
export async function verifyAdminAuth(): Promise<AdminSession> {
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    throw new Error('Authentication required')
  }

  if (session.user.email !== ADMIN_EMAIL) {
    throw new Error('Admin access required')
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email
    },
    isAdmin: true
  }
}

/**
 * Admin authentication middleware for API routes
 * Returns 401/403 responses for unauthorized access
 */
export async function requireAdminAuth() {
  try {
    const adminSession = await verifyAdminAuth()
    return { success: true, session: adminSession }
  } catch (error) {
    const message = (error as Error).message

    if (message === 'Authentication required') {
      return {
        success: false,
        response: NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }
    }

    if (message === 'Admin access required') {
      return {
        success: false,
        response: NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
    }

    return {
      success: false,
      response: NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
    }
  }
}

/**
 * Check if current user is admin (for client-side usage)
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    await verifyAdminAuth()
    return true
  } catch {
    return false
  }
}