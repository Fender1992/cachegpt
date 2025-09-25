/**
 * 🚨 IMPORTANT: READ STATUS FILE FIRST!
 * Before making ANY changes to Claude authentication setup, read:
 * /root/cachegpt/STATUS_2025_09_24.md
 *
 * This page handles Claude web session setup - critical for user experience.
 * After making changes, update STATUS file with:
 * - Changes to Claude session extraction process
 * - UX improvements or friction points
 * - Integration with unified authentication system
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Brain, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'

function ClaudeSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sessionKey, setSessionKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)

  const callbackPort = searchParams.get('callback_port')
  const source = searchParams.get('source')

  useEffect(() => {
    checkExistingSession()
  }, [])

  const checkExistingSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    // Check if user already has a Claude session
    const { data: claudeSession } = await supabase
      .from('user_claude_sessions')
      .select('session_key')
      .eq('user_id', session.user.id)
      .single()

    if (claudeSession?.session_key) {
      // Already has session, redirect
      handleSuccess()
    }
  }

  const handleSubmit = async () => {
    if (!sessionKey.trim()) {
      setError('Please enter your Claude session key')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Validate the session by making a test request using unified endpoint
      const testResponse = await fetch('/api/v2/unified-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          provider: 'claude',
          authMethod: 'web-session',
          credential: sessionKey,
          messages: [{ role: 'user', content: 'Test connection' }]
        })
      })

      if (!testResponse.ok) {
        throw new Error('Invalid session key. Please check and try again.')
      }

      const { organizationId } = await testResponse.json()

      // Save the Claude session
      const { error: saveError } = await supabase
        .from('user_claude_sessions')
        .upsert({
          user_id: session.user.id,
          session_key: sessionKey,
          organization_id: organizationId,
          updated_at: new Date().toISOString()
        })

      if (saveError) throw saveError

      handleSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to save Claude session')
      setIsLoading(false)
    }
  }

  const handleSuccess = () => {
    if (source === 'cli' && callbackPort) {
      // Redirect back to CLI
      window.location.href = `http://localhost:${callbackPort}/auth/callback?` +
        new URLSearchParams({
          provider: 'claude',
          status: 'success'
        }).toString()
    } else {
      router.push('/chat')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="glass-card rounded-3xl p-8">
          <div className="text-center mb-8">
            <Brain className="w-16 h-16 mx-auto mb-4 text-purple-400" />
            <h1 className="text-3xl font-bold mb-2 text-white">Connect Your Claude Account</h1>
            <p className="text-gray-300">Use your existing Claude.ai subscription - no API key needed!</p>
          </div>

          {showInstructions && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                How to get your Claude session key:
              </h3>
              <ol className="space-y-3 text-sm text-gray-300">
                <li className="flex gap-2">
                  <span className="text-blue-400">1.</span>
                  <span>Open <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">claude.ai</a> in a new tab and log in</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400">2.</span>
                  <span>Open Developer Tools (F12 or right-click → Inspect)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400">3.</span>
                  <span>Go to Application tab → Cookies → claude.ai</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400">4.</span>
                  <span>Find the cookie named "sessionKey" and copy its value</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400">5.</span>
                  <span>Paste it below (it should start with "sk-ant-sid...")</span>
                </li>
              </ol>
              <button
                onClick={() => setShowInstructions(false)}
                className="mt-4 text-xs text-gray-400 hover:text-white transition"
              >
                Hide instructions
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="sessionKey" className="block text-sm font-medium text-gray-300 mb-2">
                Claude Session Key
              </label>
              <input
                id="sessionKey"
                type="password"
                value={sessionKey}
                onChange={(e) => setSessionKey(e.target.value)}
                placeholder="sk-ant-sid..."
                className="w-full px-4 py-3 bg-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={isLoading}
              />
              {!showInstructions && (
                <button
                  onClick={() => setShowInstructions(true)}
                  className="mt-2 text-xs text-gray-400 hover:text-white transition"
                >
                  Show instructions
                </button>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isLoading || !sessionKey.trim()}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  Validating...
                </>
              ) : (
                <>
                  Connect Claude
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

          <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-semibold text-white mb-2">Why do we need this?</h4>
            <ul className="space-y-1 text-xs text-gray-400">
              <li>• Use your existing Claude Pro/Team subscription</li>
              <li>• No additional API costs</li>
              <li>• Your session is encrypted and stored securely</li>
              <li>• Works just like Claude Code and Cursor</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClaudeSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>}>
      <ClaudeSetupContent />
    </Suspense>
  )
}