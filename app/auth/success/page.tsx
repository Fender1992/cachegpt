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

        // Redirect to CLI callback
        window.location.href = callbackUrl
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
      <div className="text-center">
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