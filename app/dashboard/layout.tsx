// force-dynamic and revalidate removed for static export compatibility (desktop build)
// Dashboard data is fetched client-side via apiFetch so no SSR needed

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}