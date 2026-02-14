'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, Plus, History, Repeat, Zap, Rocket, Settings, Sun, Moon, Command } from 'lucide-react'

interface CommandAction {
  id: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  section: 'actions' | 'providers' | 'recent'
  onSelect: () => void
}

interface CommandPaletteProps {
  onNewChat: () => void
  onSwitchProvider: (provider: string) => void
  onToggleQuality: () => void
  onOpenSettings: () => void
  qualityMode: 'fast' | 'best'
  selectedProvider: string
  conversations?: Array<{ conversation_id: string; title: string }>
  onSelectConversation?: (id: string) => void
}

export default function CommandPalette({
  onNewChat,
  onSwitchProvider,
  onToggleQuality,
  onOpenSettings,
  qualityMode,
  selectedProvider,
  conversations = [],
  onSelectConversation,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const actions: CommandAction[] = useMemo(() => {
    const items: CommandAction[] = [
      {
        id: 'new-chat',
        label: 'New Chat',
        icon: <Plus className="w-4 h-4" />,
        shortcut: '\u2318\u21e7O',
        section: 'actions',
        onSelect: () => { onNewChat(); setOpen(false) },
      },
      {
        id: 'toggle-quality',
        label: qualityMode === 'fast' ? 'Switch to Best Quality' : 'Switch to Fast Mode',
        icon: qualityMode === 'fast' ? <Rocket className="w-4 h-4" /> : <Zap className="w-4 h-4" />,
        section: 'actions',
        onSelect: () => { onToggleQuality(); setOpen(false) },
      },
      {
        id: 'settings',
        label: 'Open Settings',
        icon: <Settings className="w-4 h-4" />,
        shortcut: '\u2318,',
        section: 'actions',
        onSelect: () => { onOpenSettings(); setOpen(false) },
      },
      {
        id: 'provider-chatgpt',
        label: 'Switch to ChatGPT',
        icon: <Repeat className="w-4 h-4" />,
        section: 'providers',
        onSelect: () => { onSwitchProvider('chatgpt'); setOpen(false) },
      },
      {
        id: 'provider-claude',
        label: 'Switch to Claude',
        icon: <Repeat className="w-4 h-4" />,
        section: 'providers',
        onSelect: () => { onSwitchProvider('claude'); setOpen(false) },
      },
      {
        id: 'provider-gemini',
        label: 'Switch to Gemini',
        icon: <Repeat className="w-4 h-4" />,
        section: 'providers',
        onSelect: () => { onSwitchProvider('gemini'); setOpen(false) },
      },
      {
        id: 'provider-perplexity',
        label: 'Switch to Perplexity',
        icon: <Repeat className="w-4 h-4" />,
        section: 'providers',
        onSelect: () => { onSwitchProvider('perplexity'); setOpen(false) },
      },
      {
        id: 'provider-auto',
        label: 'Switch to Auto (Smart Routing)',
        icon: <Repeat className="w-4 h-4" />,
        section: 'providers',
        onSelect: () => { onSwitchProvider('auto'); setOpen(false) },
      },
    ]

    // Add recent conversations
    if (onSelectConversation) {
      for (const conv of conversations.slice(0, 5)) {
        items.push({
          id: `conv-${conv.conversation_id}`,
          label: conv.title,
          icon: <History className="w-4 h-4" />,
          section: 'recent',
          onSelect: () => { onSelectConversation(conv.conversation_id); setOpen(false) },
        })
      }
    }

    return items
  }, [onNewChat, onToggleQuality, onOpenSettings, onSwitchProvider, onSelectConversation, qualityMode, conversations])

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter((a) => a.label.toLowerCase().includes(q))
  }, [actions, query])

  // Group filtered actions by section
  const sections = useMemo(() => {
    const sectionMap: Record<string, CommandAction[]> = {}
    for (const action of filteredActions) {
      if (!sectionMap[action.section]) sectionMap[action.section] = []
      sectionMap[action.section].push(action)
    }
    return sectionMap
  }, [filteredActions])

  const sectionLabels: Record<string, string> = {
    actions: 'Actions',
    providers: 'Switch Provider',
    recent: 'Recent Conversations',
  }

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Keyboard navigation within palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filteredActions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        filteredActions[selectedIndex]?.onSelect()
      }
    },
    [filteredActions, selectedIndex]
  )

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); setQuery('') }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] animate-scale-in" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[91] overflow-hidden animate-scale-in"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[300px] overflow-y-auto py-2">
            {filteredActions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">No matching commands</div>
            ) : (
              Object.entries(sections).map(([section, sectionActions]) => (
                <div key={section}>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {sectionLabels[section] || section}
                  </div>
                  {sectionActions.map((action) => {
                    const globalIdx = filteredActions.indexOf(action)
                    return (
                      <button
                        key={action.id}
                        data-index={globalIdx}
                        onClick={action.onSelect}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                          globalIdx === selectedIndex
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <span className="flex-shrink-0 text-gray-400">{action.icon}</span>
                        <span className="flex-1 truncate">{action.label}</span>
                        {action.shortcut && (
                          <kbd className="hidden sm:inline text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                            {action.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><Command className="w-3 h-3" />K to toggle</span>
            <span>&uarr;&darr; to navigate</span>
            <span>&crarr; to select</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
