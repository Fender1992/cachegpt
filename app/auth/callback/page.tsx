'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      // Check for CLI parameters from URL or localStorage
      const urlSource = searchParams.get('source')
      const urlReturnTo = searchParams.get('return_to')
      const callbackPort = searchParams.get('callback_port')


      // Also check localStorage for CLI state (preserved through OAuth)
      let cliState = null
      try {
        const stored = localStorage.getItem('cli_auth_flow')
        if (stored) {
          cliState = JSON.parse(stored)
          // Clear it after reading
          localStorage.removeItem('cli_auth_flow')
        } else {
        }
      } catch (e) {
      }

      const isFromCLI =
        urlSource === 'cli' ||
        urlReturnTo === 'terminal' ||
        (cliState && cliState.source === 'cli')

      const source = urlSource || (cliState && cliState.source) || null
      const returnTo = urlReturnTo || (cliState && cliState.return_to) || null
      const finalCallbackPort = callbackPort || (cliState && cliState.callback_port) || null

      try {
        // Get the code from URL
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          if (isFromCLI) {
            router.push(`/login?source=${source}&return_to=${returnTo}&error=callback_failed`)
          } else {
            router.push('/login?error=callback_failed')
          }
          return
        }

        if (session) {
          // User successfully authenticated
          const user = session.user

          // Check if user profile exists, create if not
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single()

          if (profileError && profileError.code === 'PGRST116') {
            // Profile doesn't exist, create it
            const { error: insertError } = await supabase
              .from('user_profiles')
              .insert({
                id: user.id,
                email: user.email!,
                full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                provider: user.app_metadata?.provider || 'email',
                provider_id: user.user_metadata?.provider_id || user.id,
                email_verified: user.email_confirmed_at ? true : false,
                last_login_at: new Date().toISOString()
              })

            if (insertError) {
            }
          } else if (!profileError && profile) {
            // Update last login
            await supabase
              .from('user_profiles')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', user.id)
          }

          // Store OAuth provider info if it's OAuth login
          if (user.app_metadata?.provider && user.app_metadata.provider !== 'email') {
            await supabase
              .from('oauth_providers')
              .upsert({
                user_id: user.id,
                provider: user.app_metadata.provider,
                provider_user_id: user.user_metadata?.provider_id || user.id,
                provider_data: user.user_metadata || {},
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,provider'
              })
          }

          // Log the login event
          await supabase.from('usage').insert({
            user_id: user.id,
            endpoint: '/auth/callback',
            method: 'POST',
            model: user.app_metadata?.provider || 'email',
            metadata: {
              provider: user.app_metadata?.provider || 'email',
              event: 'login'
            }
          })

          // Redirect based on source
          if (isFromCLI) {
            // For CLI users, redirect to success page with CLI parameters
            const params = new URLSearchParams({
              source: source || 'cli',
              return_to: returnTo || 'terminal'
            })
            if (finalCallbackPort) {
              params.set('callback_port', finalCallbackPort)
            }
            const successUrl = `/auth/success?${params.toString()}`
            router.push(successUrl)
          } else {
            // For web users, redirect to home page
            router.push('/')
          }
        } else {
          // No session, redirect to login
          if (isFromCLI) {
            router.push(`/login?source=${source}&return_to=${returnTo}&error=no_session`)
          } else {
            router.push('/login')
          }
        }
      } catch (error) {
        if (isFromCLI) {
          router.push(`/login?source=${source}&return_to=${returnTo}&error=unexpected`)
        } else {
          router.push('/login?error=unexpected')
        }
      }
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <h1 className="text-xl font-semibold text-white mb-2">Authenticating...</h1>
        <p className="text-gray-400">Please wait while we complete your sign in.</p>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-white mb-2">Loading...</h1>
          <p className="text-gray-400">Preparing authentication...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}