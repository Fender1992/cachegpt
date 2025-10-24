'use client'

import React, { ReactNode } from 'react'
import { X, Minimize2, Maximize2 } from 'lucide-react'

interface MobileChatModalProps {
  isOpen: boolean
  isMinimized: boolean
  onClose: () => void
  onToggleMinimize: () => void
  children: ReactNode
}

export default function MobileChatModal({
  isOpen,
  isMinimized,
  onClose,
  onToggleMinimize,
  children
}: MobileChatModalProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop - only show when not minimized */}
      {!isMinimized && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Modal Container */}
      <div
        className={`fixed z-50 md:hidden transition-all duration-300 ease-in-out ${
          isMinimized
            ? 'bottom-4 right-4 w-auto h-auto'
            : 'inset-0 m-0'
        }`}
      >
        {/* Minimized State - Floating Button */}
        {isMinimized && (
          <button
            onClick={onToggleMinimize}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-6 py-3 shadow-2xl flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-all"
            aria-label="Expand chat"
          >
            <Maximize2 className="w-5 h-5" />
            <span className="font-semibold">Chat</span>
          </button>
        )}

        {/* Expanded State - Full Screen Modal */}
        {!isMinimized && (
          <div className="bg-white dark:bg-gray-900 rounded-none shadow-2xl flex flex-col h-full w-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between shadow-md">
              <h2 className="text-lg font-bold">CacheGPT Chat</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleMinimize}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Minimize chat"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {children}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
