import { AuthForm } from '@/components/auth/auth-form'
import { Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ source?: string; return_to?: string; callback_port?: string }>
}) {
  const params = await searchParams;
  const isFromCLI = params?.source === 'cli' || params?.return_to === 'terminal';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="p-4 sm:p-6 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-gray-900">CacheGPT</span>
          </Link>
          <Link
            href="/"
            className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 transition"
          >
            Back to home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <AuthForm
          isFromCLI={isFromCLI}
          callbackPort={params?.callback_port}
        />
      </main>

      {/* Footer */}
      <footer className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto text-center text-xs sm:text-sm text-gray-600">
          © 2025 CacheGPT. All rights reserved.
        </div>
      </footer>
    </div>
  )
}