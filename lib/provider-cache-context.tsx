'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'

interface UserProvider {
  provider: string
  hasApiKey: boolean
}

interface ProviderCacheContextType {
  providers: UserProvider[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  invalidate: () => void
}

const ProviderCacheContext = createContext<ProviderCacheContextType | undefined>(undefined)

const CACHE_KEY = 'cachegpt_providers_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

interface CachedData {
  providers: UserProvider[]
  timestamp: number
  userId: string
}

export function ProviderCacheProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = useState<UserProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const loadFromCache = useCallback((userId: string): UserProvider[] | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (!cached) return null

      const data: CachedData = JSON.parse(cached)
      const now = Date.now()

      // Check if cache is still valid and for the same user
      if (data.userId === userId && now - data.timestamp < CACHE_DURATION) {
        return data.providers
      }

      // Cache expired or different user
      localStorage.removeItem(CACHE_KEY)
      return null
    } catch {
      return null
    }
  }, [])

  const saveToCache = useCallback((providers: UserProvider[], userId: string) => {
    try {
      const data: CachedData = {
        providers,
        timestamp: Date.now(),
        userId
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
      // Ignore cache save errors
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        setProviders([{ provider: 'auto', hasApiKey: false }])
        setCurrentUserId(null)
        setLoading(false)
        return
      }

      setCurrentUserId(session.user.id)

      // Try to load from cache first
      const cachedProviders = loadFromCache(session.user.id)
      if (cachedProviders) {
        setProviders(cachedProviders)
        setLoading(false)
        return
      }

      // Fetch from database
      const { data: credentials, error: fetchError } = await supabase
        .from('user_provider_credentials')
        .select('provider, status')
        .eq('user_id', session.user.id)
        .eq('status', 'ready')

      if (fetchError) {
        setError('Failed to fetch providers')
        setProviders([{ provider: 'auto', hasApiKey: false }])
        setLoading(false)
        return
      }

      // Build provider list
      const providerList: UserProvider[] = [
        { provider: 'auto', hasApiKey: false }
      ]

      if (credentials && credentials.length > 0) {
        const providerMap: Record<string, string> = {
          'claude': 'anthropic',
          'chatgpt': 'openai',
          'gemini': 'google',
          'perplexity': 'perplexity'
        }

        credentials.forEach((cred) => {
          const providerKey = providerMap[cred.provider] || cred.provider
          if (!providerList.find(p => p.provider === providerKey)) {
            providerList.push({ provider: providerKey, hasApiKey: true })
          }
        })
      }

      setProviders(providerList)
      saveToCache(providerList, session.user.id)
      setLoading(false)
    } catch (err) {
      setError('Error loading providers')
      setProviders([{ provider: 'auto', hasApiKey: false }])
      setLoading(false)
    }
  }, [loadFromCache, saveToCache])

  const invalidate = useCallback(() => {
    localStorage.removeItem(CACHE_KEY)
    fetchProviders()
  }, [fetchProviders])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  return (
    <ProviderCacheContext.Provider
      value={{
        providers,
        loading,
        error,
        refetch: fetchProviders,
        invalidate
      }}
    >
      {children}
    </ProviderCacheContext.Provider>
  )
}

export function useProviderCache() {
  const context = useContext(ProviderCacheContext)
  if (context === undefined) {
    throw new Error('useProviderCache must be used within a ProviderCacheProvider')
  }
  return context
}