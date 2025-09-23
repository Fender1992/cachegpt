import { AuthForm } from '@/components/auth/auth-form'
import { Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage({
  searchParams
}: {
  searchParams: { source?: string; return_to?: string }
}) {
  const isFromCLI = searchParams?.source === 'cli' || searchParams?.return_to === 'terminal';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">CacheGPT</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white transition"
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
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          © 2025 CacheGPT. All rights reserved.
        </div>
      </footer>
    </div>
  )
}