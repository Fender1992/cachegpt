import { createBrowserClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create a mock client that throws helpful errors when used
const createMockClient = (): SupabaseClient => {
  const errorMessage = 'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'

  return {
    auth: {
      getUser: () => Promise.reject(new Error(errorMessage)),
      signInWithPassword: () => Promise.reject(new Error(errorMessage)),
      signInWithOAuth: () => Promise.reject(new Error(errorMessage)),
      signUp: () => Promise.reject(new Error(errorMessage)),
      signOut: () => Promise.reject(new Error(errorMessage)),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } }
      }),
      getSession: () => Promise.reject(new Error(errorMessage)),
      setSession: () => Promise.reject(new Error(errorMessage)),
    },
    from: () => ({
      select: () => Promise.reject(new Error(errorMessage)),
      insert: () => Promise.reject(new Error(errorMessage)),
      update: () => Promise.reject(new Error(errorMessage)),
      delete: () => Promise.reject(new Error(errorMessage)),
    }),
    rpc: () => Promise.reject(new Error(errorMessage)),
  } as any
}

// Use createBrowserClient from @supabase/ssr for proper Next.js compatibility.
// This works reliably in both SSR/dev and static-export (Tauri desktop) builds.
export const supabase: SupabaseClient = supabaseUrl && supabaseAnonKey
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createMockClient()

// Log error in development/client side only
if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    'Missing required Supabase environment variables.',
    '\nNEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing',
    '\nNEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set (hidden)' : 'Missing',
    '\n\nFor Vercel deployment:',
    '\n1. Go to your Vercel project settings',
    '\n2. Navigate to Environment Variables',
    '\n3. Add both variables for Production environment',
    '\n4. Redeploy your application'
  )
}