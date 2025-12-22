'use client'

import React, { ReactNode, useRef, useState } from 'react'
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
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStartY = useRef(0)

  // Track backdrop touch coordinates to prevent accidental closes
  const backdropTouchStart = useRef({ x: 0, y: 0, time: 0 })

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - touchStartY.current
    if (diff > 0) setSwipeOffset(Math.min(diff, 200))
  }

  const handleTouchEnd = () => {
    if (swipeOffset > 100) onClose()
    setSwipeOffset(0)
  }

  // Only close on direct backdrop click (not bubbled events)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Track touch start on backdrop for scroll/tap differentiation
  const handleBackdropTouchStart = (e: React.TouchEvent) => {
    backdropTouchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    }
  }

  // Only close if touch was a tap (minimal movement, quick duration)
  const handleBackdropTouchEnd = (e: React.TouchEvent) => {
    const dx = Math.abs(e.changedTouches[0].clientX - backdropTouchStart.current.x)
    const dy = Math.abs(e.changedTouches[0].clientY - backdropTouchStart.current.y)
    const duration = Date.now() - backdropTouchStart.current.time

    // Only close if: minimal movement (< 10px) AND quick tap (< 300ms)
    // This prevents closing on scroll gestures or accidental touches
    if (dx < 10 && dy < 10 && duration < 300) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop with fade on swipe - protected against accidental closes */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] md:hidden"
        onClick={handleBackdropClick}
        onTouchStart={handleBackdropTouchStart}
        onTouchEnd={handleBackdropTouchEnd}
        aria-hidden="true"
        style={{ opacity: 1 - (swipeOffset / 200) * 0.5 }}
      />

      {/* Modal with swipe transform and safe area support */}
      <div
        className="fixed z-[70] md:hidden"
        style={{
          top: 'max(1rem, env(safe-area-inset-top))',
          right: 'max(1rem, env(safe-area-inset-right))',
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
          left: 'max(1rem, env(safe-area-inset-left))',
          transform: `translateY(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none'
        }}
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Header with swipe indicator */}
          <div
            className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 flex flex-col items-center shadow-md"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Swipe indicator bar */}
            <div className="w-12 h-1 bg-white/40 rounded-full mb-2" />
            <div className="w-full flex items-center justify-between">
              <h2 className="text-base font-bold">Chat</h2>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
