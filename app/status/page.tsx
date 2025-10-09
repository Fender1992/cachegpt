import { redirect } from 'next/navigation'
import { verifyAdminAuth } from '@/lib/admin-auth'
import StatusPageClient from './StatusPageClient'

/**
 * Server component that enforces admin authentication
 * Redirects non-admin users before rendering anything
 */
export default async function StatusPage() {
  try {
    // Verify admin access on server side
    await verifyAdminAuth()
  } catch (error) {
    // Redirect to home page if not admin
    redirect('/')
  }

  // Only render if user is admin
  return <StatusPageClient />
}