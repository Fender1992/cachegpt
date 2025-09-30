'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Zap, Crown, ArrowRight, CheckCircle } from 'lucide-react'

export default function WelcomePage() {
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
    }
  }

  const handleStartFree = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Set user to free tier with 'auto' provider
      await supabase
        .from('user_profiles')
        .update({
          selected_provider: 'groq',  // Default free provider
          enterprise_mode: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id)

      // Go straight to chat
      router.push('/chat')
    } catch (error) {
      console.error('Error setting up free tier:', error)
    }
  }

  const handleSetupPremium = () => {
    // Go to provider selection for premium setup
    router.push('/onboarding/provider')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Welcome to CacheGPT! 👋
          </h1>
          <p className="text-lg text-gray-600">
            Choose how you'd like to get started
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Free Tier Option */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-purple-200 hover:border-purple-400 transition-all relative">
            <div className="absolute -top-3 left-8 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              Recommended
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-100 rounded-xl">
                <Zap className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Start Free</h2>
                <p className="text-sm text-gray-600">No API keys needed</p>
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Free AI models</strong> - Llama 3.3 70B, Llama 4 Maverick
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Automatic selection</strong> - System picks best available model
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Smart caching</strong> - Instant responses for common queries
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Zero cost</strong> - Completely free, no credit card
                </p>
              </div>
            </div>

            <button
              onClick={handleStartFree}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              Start Chatting Free
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Premium Tier Option */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200 hover:border-blue-400 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Crown className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Premium</h2>
                <p className="text-sm text-gray-600">Use your own API keys</p>
              </div>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>GPT-5</strong> - Latest OpenAI model
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Claude Sonnet 4.5</strong> - Anthropic's newest
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Gemini 2.0</strong> - Google's latest
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">
                  <strong>Full control</strong> - Pick your preferred provider
                </p>
              </div>
            </div>

            <button
              onClick={handleSetupPremium}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              Add API Keys
              <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-xs text-gray-500 mt-3 text-center">
              You can always add API keys later in Settings
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Not sure? Start free and upgrade anytime in Settings
        </p>
      </div>
    </div>
  )
}