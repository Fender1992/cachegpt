'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the code from URL
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error during auth callback:', error)
          router.push('/login?error=callback_failed')
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
              console.error('Error creating user profile:', insertError)
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
          await supabase.from('user_usage').insert({
            user_id: user.id,
            endpoint: '/auth/callback',
            method: user.app_metadata?.provider || 'email',
            metadata: {
              provider: user.app_metadata?.provider || 'email',
              event: 'login'
            }
          })

          // Redirect to dashboard
          router.push('/dashboard')
        } else {
          // No session, redirect to login
          router.push('/login')
        }
      } catch (error) {
        console.error('Unexpected error during auth callback:', error)
        router.push('/login?error=unexpected')
      }
    }

    handleCallback()
  }, [router])

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