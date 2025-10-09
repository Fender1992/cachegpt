'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export default function AdminEnterpriseClient() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [credentials, setCredentials] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    initializeData()
  }, [])

  async function initializeData() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    if (user) {
      await loadProfile(user.id)
    }
    setLoading(false)
  }

  async function loadProfile(userId: string) {
    // Load user profile
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    setProfile(profileData)

    // Load credentials
    const { data: credsData } = await supabase
      .from('user_provider_credentials')
      .select('*')
      .eq('user_id', userId)

    setCredentials(credsData || [])
  }

  async function toggleEnterpriseMode() {
    if (!profile) return

    setSaving(true)
    setMessage('')

    const newValue = !profile.enterprise_mode

    const { error } = await supabase
      .from('user_profiles')
      .update({ enterprise_mode: newValue })
      .eq('id', profile.id)

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setProfile({ ...profile, enterprise_mode: newValue })
      setMessage(`✅ Enterprise mode ${newValue ? 'enabled' : 'disabled'}!`)
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Enterprise Mode Settings
          </h1>
          <p className="text-gray-600 mb-8">
            Admin Panel - {user?.email}
          </p>

          {/* Current Status */}
          <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
            <h2 className="text-xl font-semibold text-blue-900 mb-4">
              Current Status
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">Enterprise Mode:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  profile?.enterprise_mode
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {profile?.enterprise_mode ? '✅ Enabled' : '❌ Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">User ID:</span>
                <span className="text-gray-600 text-sm font-mono">{profile?.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">Selected Provider:</span>
                <span className="text-gray-600">{profile?.selected_provider || 'None'}</span>
              </div>
            </div>
          </div>

          {/* Toggle Button */}
          <div className="mb-8">
            <button
              onClick={toggleEnterpriseMode}
              disabled={saving}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-colors ${
                saving
                  ? 'bg-gray-400 cursor-not-allowed'
                  : profile?.enterprise_mode
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {saving ? 'Saving...' : profile?.enterprise_mode ? 'Disable Enterprise Mode' : 'Enable Enterprise Mode'}
            </button>

            {message && (
              <div className={`mt-4 p-4 rounded-lg ${
                message.includes('Error')
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-green-50 text-green-800 border border-green-200'
              }`}>
                {message}
              </div>
            )}
          </div>

          {/* API Keys Status */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              API Keys Status
            </h2>
            <div className="space-y-3">
              {['chatgpt', 'claude', 'gemini'].map(provider => {
                const cred = credentials.find(c => c.provider === provider)
                const hasKey = cred && cred.api_key

                return (
                  <div key={provider} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${hasKey ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="font-medium capitalize text-gray-700">
                        {provider === 'chatgpt' ? 'OpenAI (ChatGPT)' : provider === 'claude' ? 'Anthropic (Claude)' : 'Google (Gemini)'}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold ${hasKey ? 'text-green-700' : 'text-gray-500'}`}>
                      {hasKey ? '✅ Configured' : '❌ Not Set'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Benefits */}
          <div className="p-6 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="text-lg font-semibold text-purple-900 mb-3">
              💡 Enterprise Mode Benefits
            </h3>
            <ul className="space-y-2 text-purple-800">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span><strong>No Rate Limits:</strong> Use your own API keys, unlimited requests</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span><strong>Choose Models:</strong> Select specific models (GPT-4, Claude Opus, etc.)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span><strong>Full Control:</strong> Track your own API usage and costs</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span><strong>Priority Support:</strong> Direct access to advanced features</span>
              </li>
            </ul>
          </div>

          {/* Next Steps */}
          {profile?.enterprise_mode && (
            <div className="mt-6 p-6 bg-green-50 rounded-lg border border-green-200">
              <h3 className="text-lg font-semibold text-green-900 mb-3">
                📝 Next Steps
              </h3>
              <ol className="space-y-2 text-green-800 list-decimal list-inside">
                <li>Go to <a href="/settings" className="underline font-semibold">Settings</a></li>
                <li>Add your API keys for the providers you want to use</li>
                <li>Select your preferred provider</li>
                <li>Start chatting with no rate limits!</li>
              </ol>
            </div>
          )}

          {/* Back Button */}
          <div className="mt-8">
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
