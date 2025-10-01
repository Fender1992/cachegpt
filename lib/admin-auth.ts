import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

export interface AdminSession {
  user: {
    id: string
    email: string
  }
  isAdmin: true
  roles: string[]
}

/**
 * Check if user has admin role in user_roles table
 */
async function hasAdminRole(userId: string): Promise<boolean> {
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

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, expires_at')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle() // Changed from .single() to handle case when no rows exist

  // If table doesn't exist or query fails, return false (legacy fallback will handle)
  if (error) {
    return false
  }

  if (!data) {
    return false
  }

  // Check if role is expired
  if (data.expires_at) {
    const expiryDate = new Date(data.expires_at)
    if (expiryDate < new Date()) {
      return false
    }
  }

  return true
}

/**
 * Get all roles for a user
 */
async function getUserRoles(userId: string): Promise<string[]> {
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

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, expires_at')
    .eq('user_id', userId)

  if (error || !data) {
    return []
  }

  // Filter out expired roles
  const now = new Date()
  return data
    .filter(roleData => !roleData.expires_at || new Date(roleData.expires_at) > now)
    .map(roleData => roleData.role)
}

/**
 * Verifies admin access for protected routes
 * Returns admin session if user is authenticated admin, otherwise throws/redirects
 *
 * Checks user_roles table for admin role with proper RBAC validation
 */
export async function verifyAdminAuth(): Promise<AdminSession> {
  // Try Bearer token first
  const headersList = await headers()
  const authHeader = headersList.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      throw new Error('Authentication required')
    }

    // Check admin role
    const roles = await getUserRoles(user.id)
    const hasAdminRoleInDb = await hasAdminRole(user.id)

    if (!hasAdminRoleInDb) {
      throw new Error('Admin access required')
    }

    return {
      user: {
        id: user.id,
        email: user.email || ''
      },
      isAdmin: true,
      roles: roles
    }
  }

  // Fall back to cookie-based auth
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

  const { data: { session }, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error('Authentication required')
  }

  if (!session) {
    throw new Error('Authentication required')
  }

  // Get user roles
  const roles = await getUserRoles(session.user.id)

  // Check if user has admin role in database
  const hasAdminRoleInDb = await hasAdminRole(session.user.id)

  if (!hasAdminRoleInDb) {
    throw new Error('Admin access required')
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email || ''
    },
    isAdmin: true,
    roles: roles
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