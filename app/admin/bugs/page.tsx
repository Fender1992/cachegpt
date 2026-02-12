import AdminBugsClient from './AdminBugsClient'

/**
 * Admin bug tracker page.
 * Auth is enforced client-side (session check + redirect)
 * and at the API level (requireAdminAuth on /api/bugs/manage).
 */
export default function AdminBugsPage() {
  return <AdminBugsClient />
}
