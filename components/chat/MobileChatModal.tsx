'use client'

import React, { ReactNode } from 'react'
import { X } from 'lucide-react'

interface MobileChatModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

export default function MobileChatModal({
  isOpen,
  onClose,
  children
}: MobileChatModalProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal - Just messages and input */}
      <div className="fixed inset-4 z-[70] md:hidden">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Simple header with close button */}
          <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 flex items-center justify-between shadow-md">
            <h2 className="text-base font-bold">Chat</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat content (messages + input) */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
