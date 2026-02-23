'use client'

import { Plus, Settings, BarChart3, LogOut, LogIn, PanelLeftClose, PanelLeft, MessageSquare } from 'lucide-react'
import ConversationList from '@/components/chat/ConversationList'
import { useDesktopNavigationOptional } from './DesktopNavigationContext'

export default function DesktopSidebar() {
  const nav = useDesktopNavigationOptional()

  if (!nav) return null

  const {
    sidebarCollapsed,
    toggleSidebar,
    conversations,
    currentConversationId,
    isAnonymous,
    userEmail,
    activeView,
    setActiveView,
    onNewChat,
    onSelectConversation,
    onDeleteConversation,
    onLogout,
    onLogin,
  } = nav

  const handleNavigate = (view: 'chat' | 'settings' | 'dashboard') => {
    setActiveView(view)
    if (view === 'settings') window.location.href = '/settings'
    else if (view === 'dashboard') window.location.href = '/dashboard'
    else window.location.href = '/chat'
  }

  return (
    <div
      className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full flex-shrink-0 transition-all duration-200 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-gray-900 dark:text-white text-sm">CacheGPT</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-2">
        <button
          onClick={onNewChat}
          className={`flex items-center gap-2 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors ${
            sidebarCollapsed ? 'justify-center px-0' : ''
          }`}
          title="New Chat"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          isAnonymous={isAnonymous}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onLogin={onLogin}
          compact={sidebarCollapsed}
        />
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-2 space-y-1">
        <button
          onClick={() => handleNavigate('settings')}
          className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
            activeView === 'settings'
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
          } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
          title="Settings"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>
        <button
          onClick={() => handleNavigate('dashboard')}
          className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
            activeView === 'dashboard'
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
          } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
          title="Dashboard"
        >
          <BarChart3 className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>Dashboard</span>}
        </button>

        {/* User info & auth */}
        <div className="pt-1 border-t border-gray-200 dark:border-gray-700 mt-1">
          {isAnonymous ? (
            <button
              onClick={onLogin}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors ${
                sidebarCollapsed ? 'justify-center px-0' : ''
              }`}
              title="Sign In"
            >
              <LogIn className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>Sign In</span>}
            </button>
          ) : (
            <>
              {!sidebarCollapsed && userEmail && (
                <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 truncate">
                  {userEmail}
                </div>
              )}
              <button
                onClick={onLogout}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors ${
                  sidebarCollapsed ? 'justify-center px-0' : ''
                }`}
                title="Logout"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Logout</span>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
