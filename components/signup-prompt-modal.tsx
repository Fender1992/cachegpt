'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'
import { AuthForm } from '@/components/auth/auth-form'

const DELAY_MS = 30000 // 30 seconds
const STORAGE_KEY = 'signup_prompt_dismissed'

export default function SignupPromptModal() {
  const [showModal, setShowModal] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  useEffect(() => {
    if (isChecking || isLoggedIn) return

    // Check if user has dismissed this before
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) return

    // Set 30 second timer
    const timer = setTimeout(() => {
      setShowModal(true)
    }, DELAY_MS)

    return () => clearTimeout(timer)
  }, [isChecking, isLoggedIn])

  const checkAuthStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setIsLoggedIn(!!session)
    } catch (error) {
      setIsLoggedIn(false)
    } finally {
      setIsChecking(false)
    }
  }

  const handleClose = () => {
    setShowModal(false)
    // Remember that user dismissed this
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
  }

  if (!showModal || isLoggedIn) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Modal content */}
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Ready to get started?
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Create a free account or sign in to unlock all features
            </p>
          </div>

          {/* Auth form */}
          <AuthForm />
        </div>
      </div>
    </div>
  )
}
