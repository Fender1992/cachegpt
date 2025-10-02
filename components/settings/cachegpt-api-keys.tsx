'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import {
  Key, Plus, Trash2, Copy, Eye, EyeOff, AlertCircle, Check, ExternalLink
} from 'lucide-react'

interface CacheGPTApiKey {
  id: string
  key_name: string
  key_prefix: string
  is_active: boolean
  created_at: string
  last_used_at: string | null
  usage_count: number
  expires_at: string | null
}

export default function CacheGPTApiKeys() {
  const [apiKeys, setApiKeys] = useState<CacheGPTApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(0)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    loadApiKeys()
  }, [])

  const loadApiKeys = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/api-keys', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setApiKeys(data.apiKeys || [])
      }
    } catch (error) {
      console.error('Error loading API keys:', error)
    } finally {
      setLoading(false)
    }
  }

  const createApiKey = async () => {
    if (!keyName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a key name' })
      return
    }

    setCreating(true)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMessage({ type: 'error', text: 'Not authenticated' })
        return
      }

      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyName: keyName.trim(),
          expiresInDays: expiresInDays > 0 ? expiresInDays : null
        })
      })

      const data = await response.json()

      if (response.ok) {
        setNewApiKey(data.apiKey)
        setKeyName('')
        setExpiresInDays(0)
        setShowCreateForm(false)
        await loadApiKeys()
        setMessage({ type: 'success', text: 'API key created! Copy it now - it won\'t be shown again.' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create API key' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setCreating(false)
    }
  }

  const deleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/api-keys?id=${keyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'API key deleted successfully' })
        await loadApiKeys()
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.error || 'Failed to delete API key' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage({ type: 'success', text: 'Copied to clipboard!' })
      setTimeout(() => setMessage(null), 2000)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to copy' })
    }
  }

  if (loading) {
    return <div className="animate-pulse h-64 bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-600" />
            CacheGPT API Keys
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Use these keys to integrate CacheGPT into your applications
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
        >
          <Plus className="w-4 h-4" />
          New Key
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* New API Key Display */}
      {newApiKey && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Save this API key now! It won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded border border-yellow-300 font-mono text-sm break-all">
                  {newApiKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newApiKey)}
                  className="p-2 text-yellow-700 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100"
                  title="Copy to clipboard"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => setNewApiKey(null)}
            className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 hover:underline"
          >
            I've saved this key
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">Create New API Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Key Name
              </label>
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., Production App, Development, Testing"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Expiration (optional)
              </label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                <option value={0}>Never expires</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createApiKey}
                disabled={creating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys List */}
      {apiKeys.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No API keys yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map(key => (
            <div key={key.id} className="border dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-gray-900 dark:text-white">{key.key_name}</h4>
                    {key.is_active ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400 rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <p className="font-mono">{key.key_prefix}...</p>
                    <p>Created: {new Date(key.created_at).toLocaleDateString()}</p>
                    {key.last_used_at && (
                      <p>Last used: {new Date(key.last_used_at).toLocaleDateString()}</p>
                    )}
                    <p>Usage: {key.usage_count.toLocaleString()} requests</p>
                    {key.expires_at && (
                      <p className="text-yellow-600 dark:text-yellow-400">
                        Expires: {new Date(key.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteApiKey(key.id)}
                  className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition"
                  title="Delete key"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documentation Link */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-start gap-2">
          <ExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              How to use your API key
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
              Include your API key in the <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded">Authorization</code> header:
            </p>
            <code className="block px-3 py-2 bg-blue-100 dark:bg-blue-800 rounded text-sm font-mono">
              Authorization: Bearer cgpt_sk_your_key_here
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
