// generateStaticParams returns [] so this dynamic route is not pre-rendered
// but can still be navigated to client-side in the desktop static export
export async function generateStaticParams() {
  return []
}

export { default } from '../page'
