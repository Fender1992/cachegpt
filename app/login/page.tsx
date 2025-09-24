import { AuthForm } from '@/components/auth/auth-form'
import { Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ source?: string; return_to?: string }>
}) {
  const params = await searchParams;
  const isFromCLI = params?.source === 'cli' || params?.return_to === 'terminal';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="p-6 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">CacheGPT</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 transition"
          >
            Back to home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <AuthForm isFromCLI={isFromCLI} />
      </main>

      {/* Footer */}
      <footer className="p-6">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-600">
          © 2025 CacheGPT. All rights reserved.
        </div>
      </footer>
    </div>
  )
}