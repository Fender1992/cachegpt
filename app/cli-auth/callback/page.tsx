'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

function CLIAuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Auth error:', error)
          router.push('/cli-auth?error=callback_failed')
          return
        }

        if (session) {
          // First delete any existing session for this user
          await supabase
            .from('cli_auth_sessions')
            .delete()
            .eq('user_id', session.user.id)

          // Save session for CLI
          const { error: saveError } = await supabase
            .from('cli_auth_sessions')
            .insert({
              user_id: session.user.id,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              user_email: session.user.email || '',
              expires_at: session.expires_at,
              status: 'authenticated',
              created_at: new Date().toISOString()
            })

          if (saveError) {
            console.error('Failed to save CLI session:', saveError)
          }

          // Redirect to success page
          router.push('/cli-auth/success')
        } else {
          router.push('/cli-auth?error=no_session')
        }
      } catch (error) {
        console.error('Unexpected error:', error)
        router.push('/cli-auth?error=unexpected')
      }
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <h1 className="text-xl font-semibold text-white mb-2">Authenticating...</h1>
        <p className="text-gray-400">Please wait while we complete your sign in.</p>
      </div>
    </div>
  )
}

export default function CLIAuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-white mb-2">Loading...</h1>
        </div>
      </div>
    }>
      <CLIAuthCallbackContent />
    </Suspense>
  )
}