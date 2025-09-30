'use client'

import { useState } from 'react'
import { Bug, X, Send } from 'lucide-react'
import Toast from './toast'

interface BugReportButtonProps {
  className?: string
}

interface ToastNotification {
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

export default function BugReportButton({ className = '' }: BugReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastNotification | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'general',
    priority: 'medium',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim() || !formData.description.trim()) {
      setToast({ message: 'Please fill in title and description', type: 'warning' })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/bugs/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          category: formData.category,
          priority: formData.priority,
          stepsToReproduce: formData.stepsToReproduce.trim() || null,
          expectedBehavior: formData.expectedBehavior.trim() || null,
          actualBehavior: formData.actualBehavior.trim() || null,
          url: window.location.href
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to submit bug report')
      }

      // Show success toast
      setToast({ message: 'Bug report submitted successfully! Thank you for helping improve CacheGPT.', type: 'success' })

      // Close modal and reset form
      setIsOpen(false)
      setFormData({
        title: '',
        description: '',
        category: 'general',
        priority: 'medium',
        stepsToReproduce: '',
        expectedBehavior: '',
        actualBehavior: ''
      })

    } catch (error) {
      console.error('Error submitting bug report:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit bug report. Please try again.'
      setToast({ message: errorMessage, type: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating Bug Report Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-6 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all z-40 ${className}`}
        title="Report a Bug"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        <Bug className="w-5 h-5" />
      </button>

      {/* Bug Report Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Bug className="w-6 h-6 text-red-600 dark:text-red-400" />
                    Report a Bug
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bug Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Brief description of the issue"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      >
                        <option value="general">General</option>
                        <option value="ui">UI/Design</option>
                        <option value="mobile">Mobile</option>
                        <option value="auth">Authentication</option>
                        <option value="api">API</option>
                        <option value="performance">Performance</option>
                        <option value="cli">CLI</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description *
                    </label>
                    <textarea
                      required
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Detailed description of the bug"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Steps to Reproduce
                    </label>
                    <textarea
                      value={formData.stepsToReproduce}
                      onChange={(e) => setFormData(prev => ({ ...prev, stepsToReproduce: e.target.value }))}
                      placeholder="1. Step one&#10;2. Step two&#10;3. Step three"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Expected Behavior
                      </label>
                      <textarea
                        value={formData.expectedBehavior}
                        onChange={(e) => setFormData(prev => ({ ...prev, expectedBehavior: e.target.value }))}
                        placeholder="What should happen"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Actual Behavior
                      </label>
                      <textarea
                        value={formData.actualBehavior}
                        onChange={(e) => setFormData(prev => ({ ...prev, actualBehavior: e.target.value }))}
                        placeholder="What actually happens"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!formData.title.trim() || !formData.description.trim() || isSubmitting}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit Bug Report
                      </>
                    )}
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={5000}
        />
      )}
    </>
  )
}