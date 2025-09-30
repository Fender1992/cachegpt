import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// LEGACY: Fallback admin email for backwards compatibility
// TODO: Remove after all admins are migrated to user_roles table
const LEGACY_ADMIN_EMAIL = 'rolandofender@gmail.com'

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
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, expires_at')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle() // Changed from .single() to handle case when no rows exist

  // If table doesn't exist or query fails, log and return false (legacy fallback will handle)
  if (error) {
    console.log('[ADMIN-AUTH] user_roles query error (using legacy fallback):', error.message)
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
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

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
 * Checks in order:
 * 1. user_roles table (preferred)
 * 2. Legacy hardcoded email (fallback for backwards compatibility)
 */
export async function verifyAdminAuth(): Promise<AdminSession> {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

  const { data: { session }, error } = await supabase.auth.getSession()

  if (error) {
    console.error('[ADMIN-AUTH] Session error:', error.message)
    throw new Error('Authentication required')
  }

  if (!session) {
    console.log('[ADMIN-AUTH] No session found')
    throw new Error('Authentication required')
  }

  console.log('[ADMIN-AUTH] Checking admin access for:', session.user.email)

  // Get user roles
  const roles = await getUserRoles(session.user.id)
  console.log('[ADMIN-AUTH] User roles from DB:', roles)

  // Check if user has admin role in database
  const hasAdminRoleInDb = await hasAdminRole(session.user.id)
  console.log('[ADMIN-AUTH] Has admin role in DB:', hasAdminRoleInDb)

  // Legacy fallback: Check hardcoded email
  const isLegacyAdmin = session.user.email === LEGACY_ADMIN_EMAIL
  console.log('[ADMIN-AUTH] Is legacy admin:', isLegacyAdmin, '(email:', session.user.email, ')')

  if (!hasAdminRoleInDb && !isLegacyAdmin) {
    console.error('[ADMIN-AUTH] Access denied for:', session.user.email)
    throw new Error('Admin access required')
  }

  // Log if using legacy admin (for monitoring migration)
  if (isLegacyAdmin && !hasAdminRoleInDb) {
    console.warn(`[ADMIN-AUTH] User ${session.user.email} accessing via legacy email check. Please migrate to user_roles table.`)
  }

  console.log('[ADMIN-AUTH] ✅ Admin access granted for:', session.user.email)

  return {
    user: {
      id: session.user.id,
      email: session.user.email || ''
    },
    isAdmin: true,
    roles: hasAdminRoleInDb ? roles : ['admin'] // Include all roles if in DB
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