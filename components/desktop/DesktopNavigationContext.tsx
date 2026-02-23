'use client'

import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'

export type DesktopView = 'chat' | 'settings' | 'dashboard'

export interface Conversation {
  conversation_id: string
  title: string
  message_count: number
  provider: string
  last_message_at: string
}

interface DesktopNavigationState {
  activeView: DesktopView
  sidebarCollapsed: boolean
  conversations: Conversation[]
  currentConversationId: string | null
  userEmail: string | null
  isAnonymous: boolean
}

interface DesktopNavigationActions {
  setActiveView: (view: DesktopView) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setConversations: (conversations: Conversation[]) => void
  setCurrentConversationId: (id: string | null) => void
  setUserEmail: (email: string | null) => void
  setIsAnonymous: (anon: boolean) => void
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string, event: React.MouseEvent) => void
  onLogout: () => void
  onLogin: () => void
}

export type DesktopNavigationContextType = DesktopNavigationState & DesktopNavigationActions & {
  /** Internal: ChatInterface uses this to register its callbacks */
  _setChatCallbacks: (cbs: ChatCallbacks) => void
}

interface ChatCallbacks {
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string, event: React.MouseEvent) => void
  onLogout: () => void
  onLogin: () => void
}

const DesktopNavigationContext = createContext<DesktopNavigationContextType | null>(null)

export function useDesktopNavigation() {
  const ctx = useContext(DesktopNavigationContext)
  if (!ctx) {
    throw new Error('useDesktopNavigation must be used within DesktopNavigationProvider')
  }
  return ctx
}

/** Safe version that returns null outside provider — for optional usage */
export function useDesktopNavigationOptional() {
  return useContext(DesktopNavigationContext)
}

interface DesktopNavigationProviderProps {
  children: ReactNode
}

export function DesktopNavigationProvider({ children }: DesktopNavigationProviderProps) {
  const [activeView, setActiveView] = useState<DesktopView>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)

  // Use a ref for chat callbacks so updating them doesn't trigger context re-renders
  const chatCallbacksRef = useRef<ChatCallbacks>({
    onNewChat: () => {},
    onSelectConversation: () => {},
    onDeleteConversation: () => {},
    onLogout: () => {},
    onLogin: () => {},
  })

  const _setChatCallbacks = useCallback((cbs: ChatCallbacks) => {
    chatCallbacksRef.current = cbs
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  // Stable callback wrappers that delegate to the ref
  const onNewChat = useCallback(() => chatCallbacksRef.current.onNewChat(), [])
  const onSelectConversation = useCallback((id: string) => chatCallbacksRef.current.onSelectConversation(id), [])
  const onDeleteConversation = useCallback((id: string, event: React.MouseEvent) => chatCallbacksRef.current.onDeleteConversation(id, event), [])
  const onLogout = useCallback(() => chatCallbacksRef.current.onLogout(), [])
  const onLogin = useCallback(() => chatCallbacksRef.current.onLogin(), [])

  const value = useMemo<DesktopNavigationContextType>(() => ({
    activeView,
    sidebarCollapsed,
    conversations,
    currentConversationId,
    userEmail,
    isAnonymous,
    setActiveView,
    toggleSidebar,
    setSidebarCollapsed,
    setConversations,
    setCurrentConversationId,
    setUserEmail,
    setIsAnonymous,
    onNewChat,
    onSelectConversation,
    onDeleteConversation,
    onLogout,
    onLogin,
    _setChatCallbacks,
  }), [
    activeView, sidebarCollapsed, conversations, currentConversationId,
    userEmail, isAnonymous, toggleSidebar, onNewChat, onSelectConversation,
    onDeleteConversation, onLogout, onLogin, _setChatCallbacks,
  ])

  return (
    <DesktopNavigationContext.Provider value={value}>
      {children}
    </DesktopNavigationContext.Provider>
  )
}
