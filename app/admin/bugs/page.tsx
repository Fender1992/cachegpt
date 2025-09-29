'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import {
  Bug, Filter, Search, Calendar, User, Globe,
  AlertTriangle, CheckCircle, Clock, XCircle,
  Edit, Trash2, Eye, ArrowLeft, RefreshCw
} from 'lucide-react'

interface BugReport {
  id: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: string
  user_email: string | null
  user_agent: string | null
  url: string | null
  steps_to_reproduce: string | null
  expected_behavior: string | null
  actual_behavior: string | null
  browser_info: any
  screenshot_url: string | null
  admin_notes: string | null
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

interface BugStatistics {
  total_bugs: number
  open_bugs: number
  in_progress_bugs: number
  resolved_bugs: number
  closed_bugs: number
  critical_bugs: number
  high_priority_bugs: number
  bugs_this_week: number
  bugs_today: number
  avg_resolution_hours: number
}

const statusIcons = {
  open: AlertTriangle,
  in_progress: Clock,
  resolved: CheckCircle,
  closed: XCircle
}

const statusColors = {
  open: 'text-red-600 bg-red-50',
  in_progress: 'text-yellow-600 bg-yellow-50',
  resolved: 'text-green-600 bg-green-50',
  closed: 'text-gray-600 bg-gray-50'
}

const priorityColors = {
  low: 'text-blue-600 bg-blue-50',
  medium: 'text-yellow-600 bg-yellow-50',
  high: 'text-orange-600 bg-orange-50',
  critical: 'text-red-600 bg-red-50'
}

export default function AdminBugsPage() {
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [statistics, setStatistics] = useState<BugStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkAdminAccess()
  }, [])

  const checkAdminAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      if (session.user.email !== 'rolandofender@gmail.com') {
        router.push('/')
        return
      }

      await loadBugs()
    } catch (error) {
      console.error('Admin access check failed:', error)
      setError('Access denied')
    }
  }

  const loadBugs = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (categoryFilter) params.append('category', categoryFilter)

      const response = await fetch(`/api/bugs/report?${params}`)

      if (!response.ok) {
        throw new Error('Failed to load bugs')
      }

      const data = await response.json()
      setBugs(data.bugs || [])
      setStatistics(data.statistics)
    } catch (error) {
      console.error('Error loading bugs:', error)
      setError('Failed to load bugs')
    } finally {
      setLoading(false)
    }
  }

  const updateBugStatus = async (bugId: string, updates: Partial<BugReport>) => {
    try {
      const response = await fetch('/api/bugs/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bugId, updates })
      })

      if (!response.ok) {
        throw new Error('Failed to update bug')
      }

      await loadBugs()
      if (selectedBug?.id === bugId) {
        setSelectedBug(prev => prev ? { ...prev, ...updates } : null)
      }
    } catch (error) {
      console.error('Error updating bug:', error)
      alert('Failed to update bug')
    }
  }

  const deleteBug = async (bugId: string) => {
    if (!confirm('Are you sure you want to delete this bug report?')) return

    try {
      const response = await fetch(`/api/bugs/manage?id=${bugId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete bug')
      }

      await loadBugs()
      if (selectedBug?.id === bugId) {
        setSelectedBug(null)
      }
    } catch (error) {
      console.error('Error deleting bug:', error)
      alert('Failed to delete bug')
    }
  }

  const filteredBugs = bugs.filter(bug =>
    bug.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bug.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Bug className="w-8 h-8 text-red-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Bug Tracker</h1>
                <p className="text-sm text-gray-600">Admin Dashboard</p>
              </div>
            </div>
            <button
              onClick={loadBugs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Statistics */}
        {statistics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{statistics.total_bugs}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl font-bold text-red-600">{statistics.open_bugs}</div>
              <div className="text-sm text-gray-600">Open</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl font-bold text-yellow-600">{statistics.in_progress_bugs}</div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl font-bold text-green-600">{statistics.resolved_bugs}</div>
              <div className="text-sm text-gray-600">Resolved</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl font-bold text-orange-600">{statistics.critical_bugs}</div>
              <div className="text-sm text-gray-600">Critical</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{statistics.bugs_today}</div>
              <div className="text-sm text-gray-600">Today</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search bugs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="ui">UI</option>
              <option value="mobile">Mobile</option>
              <option value="auth">Auth</option>
              <option value="api">API</option>
              <option value="performance">Performance</option>
              <option value="cli">CLI</option>
              <option value="general">General</option>
            </select>

            <button
              onClick={loadBugs}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Apply
            </button>
          </div>
        </div>

        {/* Bug List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bug Cards */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white p-8 rounded-lg shadow-sm text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading bugs...</p>
              </div>
            ) : filteredBugs.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow-sm text-center">
                <Bug className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No bugs found</p>
              </div>
            ) : (
              filteredBugs.map((bug) => {
                const StatusIcon = statusIcons[bug.status]
                return (
                  <div
                    key={bug.id}
                    className={`bg-white p-4 rounded-lg shadow-sm border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                      bug.priority === 'critical' ? 'border-red-500' :
                      bug.priority === 'high' ? 'border-orange-500' :
                      bug.priority === 'medium' ? 'border-yellow-500' : 'border-blue-500'
                    } ${selectedBug?.id === bug.id ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={() => setSelectedBug(bug)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 line-clamp-2">{bug.title}</h3>
                      <div className="flex items-center gap-2 ml-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[bug.priority]}`}>
                          {bug.priority}
                        </span>
                        <div className={`p-1 rounded-full ${statusColors[bug.status]}`}>
                          <StatusIcon className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{bug.description}</p>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(bug.created_at).toLocaleDateString()}
                        </span>
                        {bug.user_email && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {bug.user_email}
                          </span>
                        )}
                        {bug.url && (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {new URL(bug.url).pathname}
                          </span>
                        )}
                      </div>
                      <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                        {bug.category}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Bug Details Panel */}
          <div className="sticky top-6">
            {selectedBug ? (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">{selectedBug.title}</h2>
                  <button
                    onClick={() => setSelectedBug(null)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {/* Status & Priority Controls */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={selectedBug.status}
                      onChange={(e) => updateBugStatus(selectedBug.id, { status: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={selectedBug.priority}
                      onChange={(e) => updateBugStatus(selectedBug.id, { priority: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                {/* Bug Details */}
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedBug.description}</p>
                  </div>

                  {selectedBug.steps_to_reproduce && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Steps to Reproduce</h3>
                      <p className="text-gray-700 whitespace-pre-wrap">{selectedBug.steps_to_reproduce}</p>
                    </div>
                  )}

                  {selectedBug.expected_behavior && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Expected Behavior</h3>
                      <p className="text-gray-700 whitespace-pre-wrap">{selectedBug.expected_behavior}</p>
                    </div>
                  )}

                  {selectedBug.actual_behavior && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Actual Behavior</h3>
                      <p className="text-gray-700 whitespace-pre-wrap">{selectedBug.actual_behavior}</p>
                    </div>
                  )}

                  {selectedBug.screenshot_url && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Screenshot</h3>
                      <img
                        src={selectedBug.screenshot_url}
                        alt="Bug screenshot"
                        className="max-w-full h-auto rounded-lg border"
                      />
                    </div>
                  )}

                  {/* Technical Info */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Technical Information</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Created:</strong> {new Date(selectedBug.created_at).toLocaleString()}</p>
                      <p><strong>Updated:</strong> {new Date(selectedBug.updated_at).toLocaleString()}</p>
                      {selectedBug.user_email && <p><strong>User:</strong> {selectedBug.user_email}</p>}
                      {selectedBug.url && <p><strong>URL:</strong> {selectedBug.url}</p>}
                      {selectedBug.user_agent && <p><strong>User Agent:</strong> {selectedBug.user_agent}</p>}
                      {selectedBug.resolved_at && <p><strong>Resolved:</strong> {new Date(selectedBug.resolved_at).toLocaleString()}</p>}
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Admin Notes</label>
                    <textarea
                      value={selectedBug.admin_notes || ''}
                      onChange={(e) => setSelectedBug(prev => prev ? { ...prev, admin_notes: e.target.value } : null)}
                      onBlur={(e) => updateBugStatus(selectedBug.id, { admin_notes: e.target.value })}
                      placeholder="Add admin notes..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={() => deleteBug(selectedBug.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select a bug to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}