'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'

export default function CLIAuthSuccess() {
  const [provider, setProvider] = useState<string | null>(null)

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Auto-close after 3 seconds
      setTimeout(() => {
        try {
          window.close()
        } catch (e) {
          // Can't close programmatically
        }
      }, 3000)
    }
  }

  const selectProvider = async (selectedProvider: string) => {
    setProvider(selectedProvider)

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Save provider selection
      await supabase.from('user_provider_credentials').upsert({
        user_id: session.user.id,
        provider: selectedProvider,
        user_email: session.user.email || '',
        status: 'ready',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      })

      // Show success and close
      setTimeout(() => {
        try {
          window.close()
        } catch (e) {
          // Can't close programmatically
        }
      }, 1000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-lg p-8 shadow-xl text-center">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-2">Authentication Successful!</h1>

          {!provider ? (
            <>
              <p className="text-gray-400 mb-8">Select your LLM provider:</p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => selectProvider('chatgpt')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-green-400 text-2xl mb-2">🤖</div>
                  <div className="font-semibold">ChatGPT</div>
                </button>

                <button
                  onClick={() => selectProvider('claude')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-purple-400 text-2xl mb-2">🧠</div>
                  <div className="font-semibold">Claude</div>
                </button>

                <button
                  onClick={() => selectProvider('gemini')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-blue-400 text-2xl mb-2">✨</div>
                  <div className="font-semibold">Gemini</div>
                </button>

                <button
                  onClick={() => selectProvider('perplexity')}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  <div className="text-orange-400 text-2xl mb-2">⚡</div>
                  <div className="font-semibold">Perplexity</div>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">Provider selected: {provider}</p>
              <p className="text-gray-300">You can close this window and return to the terminal.</p>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-sm text-gray-500">
              This window will close automatically...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}