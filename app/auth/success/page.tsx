'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { CheckCircle2 } from 'lucide-react'

function AuthSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    handlePostAuth()
  }, [])

  const handlePostAuth = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

    // Check if user already has a provider selected
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('selected_provider')
      .eq('id', session.user.id)
      .single()

    // Get CLI parameters if present
    const source = searchParams.get('source')
    const callbackPort = searchParams.get('callback_port')

    // Build query params for next page
    const params = new URLSearchParams()
    if (source) params.set('source', source)
    if (callbackPort) params.set('callback_port', callbackPort)
    const queryString = params.toString() ? `?${params.toString()}` : ''

    if (profile?.selected_provider) {
      // User has provider, go to chat
      if (source === 'cli' && callbackPort) {

        // CLI user - redirect back to local callback WITH SESSION TOKEN
        const callbackUrl = `http://localhost:${callbackPort}/auth/callback?` +
          new URLSearchParams({
            provider: profile.selected_provider,
            supabase_jwt: session.access_token,  // Use same parameter name as CLI expects
            user: JSON.stringify({
              email: session.user.email || '',
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
              id: session.user.id
            })
          }).toString()

        // Try to redirect to CLI callback
        // Many browsers block HTTPS -> HTTP localhost redirects for security
        // Show a UI with manual click option as fallback

        // First, update the UI to show we're redirecting
        const redirectUI = document.getElementById('redirect-status')
        if (redirectUI) {
          redirectUI.innerHTML = `
            <div style="text-align: center; padding: 20px;">
              <h2 style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 16px;">
                ✅ Authentication Successful!
              </h2>
              <p style="color: #d1d5db; margin-bottom: 24px; font-size: 18px;">
                Completing setup with your terminal...
              </p>

              <div style="background: rgba(31, 41, 55, 0.5); border-radius: 12px; padding: 30px; margin-bottom: 24px; border: 2px solid rgba(34, 197, 94, 0.3);">
                <p style="color: #9ca3af; margin-bottom: 20px; font-size: 16px;">
                  ⚠️ Your browser may be blocking the redirect to localhost.
                </p>

                <p style="color: white; margin-bottom: 20px; font-size: 18px; font-weight: 600;">
                  👇 Click the button below to complete authentication:
                </p>

                <a
                  href="${callbackUrl}"
                  style="display: inline-block; padding: 16px 32px; background: #22c55e; color: white; font-weight: bold; font-size: 18px; border-radius: 8px; text-decoration: none; cursor: pointer; border: 2px solid #16a34a; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); transition: all 0.2s;"
                  onmouseover="this.style.background='#16a34a'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 8px rgba(0, 0, 0, 0.15)';"
                  onmouseout="this.style.background='#22c55e'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px rgba(0, 0, 0, 0.1)';"
                >
                  🔐 CLICK HERE TO COMPLETE AUTHENTICATION
                </a>
              </div>

              <p style="color: #6b7280; font-size: 12px;">
                This will redirect you to: <br/>
                <code style="background: rgba(31, 41, 55, 0.5); padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                  ${callbackUrl.substring(0, 50)}...
                </code>
              </p>
            </div>
          `
        }

        // Try automatic redirect
        setTimeout(() => {
          window.location.href = callbackUrl
        }, 500)
      } else {
        router.push('/chat')
      }
    } else {

      // No provider selected, go to onboarding
      router.push(`/onboarding/provider${queryString}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div id="redirect-status" className="text-center max-w-md">
        <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
        <h1 className="text-2xl font-bold text-white mb-2">Authentication Successful</h1>
        <p className="text-gray-300">Setting up your account...</p>
        <div className="mt-4">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    </div>
  )
}

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-white mb-2">Loading...</h1>
          <p className="text-gray-300">Preparing your authentication...</p>
        </div>
      </div>
    }>
      <AuthSuccessContent />
    </Suspense>
  )
}